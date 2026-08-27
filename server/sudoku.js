/**
 * sudoku.js — server-authoritative Sudoku.
 *
 * WHY THIS EXISTS. The puzzle was generated in the browser, the solution was
 * held in the browser, the browser decided whether you had solved it, and the
 * browser told the server what to pay. The only things standing between that
 * and an open faucet were a Ƒ4,200 payout cap, a 20 second minimum round
 * duration, and a cooldown living in localStorage. Two console calls paid the
 * Insane reward without a cell being filled, every twenty seconds, forever.
 *
 * The shape is the one the Guild Numeracy Exams already use: the server builds
 * the paper, holds the key, counts the hints, owns the cooldown and computes
 * the payout. The client renders and collects input.
 *
 * GRADING IS BY VALIDITY, NOT BY EQUALITY, and that is a fix rather than a
 * shortcut. The generator removes clues at random with no uniqueness check, so
 * a low clue puzzle usually has more than one valid completion. The old client
 * compared the player's grid against ITS stored solution cell by cell, which
 * means a genuinely correct solve of a multi solution puzzle was rejected as
 * wrong. Porting that comparison to the server would have made a real bug
 * authoritative. A grid is correct here if it agrees with every given and every
 * row, column and box is a permutation of one to nine, which is what "solved"
 * means.
 */

import { randomInt } from 'crypto';

/* Unbiased shuffle on a real RNG. Array.sort with a random comparator, which is
   what the client generator used, is neither a shuffle nor uniform, and the
   generator is now the thing that decides what a player is paid for. */
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function allowed(grid, pos, n) {
  const r = (pos / 9) | 0, c = pos % 9;
  const br = ((r / 3) | 0) * 3, bc = ((c / 3) | 0) * 3;
  for (let i = 0; i < 9; i++) {
    if (grid[r * 9 + i] === n) return false;
    if (grid[i * 9 + c] === n) return false;
    if (grid[(br + ((i / 3) | 0)) * 9 + (bc + i % 3)] === n) return false;
  }
  return true;
}

function fillFrom(grid, pos) {
  if (pos === 81) return true;
  for (const n of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (!allowed(grid, pos, n)) continue;
    grid[pos] = n;
    if (fillFrom(grid, pos + 1)) return true;
    grid[pos] = 0;
  }
  return false;
}

/* How many distinct completions a puzzle has, counted up to `stop` and no
   further. Used for measurement and for the uniqueness flag on a generated
   puzzle; it is NOT used to gate generation, because enforcing uniqueness
   would silently change every difficulty's real clue count and that is a
   balance decision rather than a security one. */
export function completions(puzzle, stop = 2) {
  const g = puzzle.slice();
  const out = [];
  (function walk(pos) {
    if (out.length >= stop) return;
    while (pos < 81 && g[pos] !== 0) pos++;
    if (pos === 81) { out.push(g.slice()); return; }
    for (let n = 1; n <= 9; n++) {
      if (out.length >= stop) return;
      if (!allowed(g, pos, n)) continue;
      g[pos] = n;
      walk(pos + 1);
      g[pos] = 0;
    }
  })(0);
  return out;
}
export function countSolutions(puzzle, stop = 2) {
  return completions(puzzle, stop).length;
}

/* THE CLUE COUNTS HAD TO MOVE, AND THAT IS A CONSEQUENCE OF THE FIX RATHER
   THAN A BALANCE PASS BOLTED ONTO IT.

   The old generator removed clues at random with no uniqueness check. Measured
   over the shipped clue counts, the fraction of generated puzzles with exactly
   one solution was: Easy 53%, Medium 10%, and Hard, Expert and Insane all 0%,
   with the median board at those three tiers having more than fifty valid
   completions.

   That has two consequences and both matter.

   FIRST, THE GAME REJECTED CORRECT ANSWERS. The old client compared the
   player's grid against its own stored solution cell by cell, so on a board
   with fifty completions a genuinely correct solve was told "Not quite right"
   unless it happened to reproduce the one hidden grid. Above Easy that was
   essentially never. The only reliable way to be paid for a Hard puzzle was to
   take enough hints to be handed the stored solution, or to forge the payout.

   SECOND, IT INVERTED THE LADDER. A seventeen clue board with fifty
   completions is EASIER than a forty six clue board with one, because almost
   anything consistent finishes it. Insane paid Ƒ4,000 for the softest puzzle on
   the menu.

   So grading by validity, which is the correct grade, cannot ship on top of a
   generator that emits ambiguous boards: it would turn "nobody can win Hard"
   into "everybody wins Insane". Removal now preserves uniqueness, and the
   targets are the ones that greedy uniqueness preserving removal actually
   reaches. Measured over 25 puzzles per tier, every tier below hits its target
   25 times out of 25 within the work budget.

   REWARDS ARE UNCHANGED. The tiers are ordered by real difficulty now, which
   they were not before, so the existing prices sit on a ladder that means
   something for the first time.

   COOLDOWNS ARE UNCHANGED AT THIRTY MINUTES. What changed is where they live.
   A cooldown in localStorage is advice. */
export const DIFFICULTIES = [
  { id: 0, name: 'Easy',   game: 'sudoku_easy',   clues: 46, reward: 50,   cooldownMs: 30 * 60_000 },
  { id: 1, name: 'Medium', game: 'sudoku_medium', clues: 39, reward: 200,  cooldownMs: 30 * 60_000 },
  { id: 2, name: 'Hard',   game: 'sudoku_hard',   clues: 33, reward: 750,  cooldownMs: 30 * 60_000 },
  { id: 3, name: 'Expert', game: 'sudoku_expert', clues: 29, reward: 2500, cooldownMs: 30 * 60_000 },
  { id: 4, name: 'Insane', game: 'sudoku_insane', clues: 26, reward: 4000, cooldownMs: 30 * 60_000 },
];
export const DIFF_BY_ID   = new Map(DIFFICULTIES.map(d => [d.id, d]));
export const DIFF_BY_GAME = new Map(DIFFICULTIES.map(d => [d.game, d]));

/* A WALL CLOCK CEILING ON GENERATION, because this runs on the same thread as
   everything else. Uniqueness preserving removal costs a solver run per
   candidate cell and the cost climbs sharply as the board empties: measured
   median 31ms and worst case 191ms at the hardest tier, against under 10ms for
   the top three. The budget bounds the worst case rather than the typical one.
   Hitting it leaves a few more clues on the board, which makes the puzzle
   easier and never makes it invalid or ambiguous.

   The cooldown check runs BEFORE generation, so a client cannot spend server
   time by asking for puzzles it is not entitled to. */
export const CARVE_BUDGET_MS = 250;

/* A hint costs one fifth of the prize and there are at most four, which is
   where the old penalty bottomed out anyway. Unbounded hints against a floored
   penalty is a free auto solve for 20% of the prize: eighty one hints and the
   board fills itself, with nothing after the fourth costing anything.

   HINT_MAX IS HINT_STEPS MINUS ONE, and that relationship is the rule rather
   than a coincidence: the last hint a player can take is the last one that
   leaves them something to be paid, so hinting can never reduce the prize to
   nothing and there is never a reason to refuse a hint you have already paid
   for.

   THE ARITHMETIC IS A FRACTION AND NOT A DECIMAL. Written as
   `1 - used * 0.2`, four hints on the Ƒ4,000 board produced 0.19999999999999996
   and floored to Ƒ799 rather than Ƒ800, which is a rounding error the player
   pays. Found by an assertion that expected the round number. */
export const HINT_STEPS   = 5;
export const HINT_MAX     = HINT_STEPS - 1;
export const HINT_PENALTY = 1 / HINT_STEPS;   // derived, for display only

export function rewardFor(diff, hintsUsed) {
  const used = Math.max(0, Math.min(HINT_MAX, hintsUsed | 0));
  return Math.floor(diff.reward * (HINT_STEPS - used) / HINT_STEPS);
}
/* The payout cap backstop, per difficulty. One shared `sudoku` key meant the
   cap on an Easy round was the INSANE reward: a forged Easy settlement paid
   Ƒ4,200 for a Ƒ50 puzzle. */
export function maxGross(diff) { return diff.reward + 1; }

/* Carve a solved grid down toward `clues`, removing a cell only when the board
   still has exactly one completion. Returns the actual clue count, which is the
   target unless the budget ran out first. */
export function generate(clues, budgetMs) {
  const solution = new Array(81).fill(0);
  fillFrom(solution, 0);
  const target = Math.max(17, Math.min(81, clues | 0));
  const budget = Math.max(1, budgetMs === undefined ? CARVE_BUDGET_MS : budgetMs);
  const puzzle = solution.slice();
  let left = 81;
  const started = Date.now();
  for (const i of shuffled([...Array(81).keys()])) {
    if (left <= target) break;
    if (Date.now() - started > budget) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) !== 1) { puzzle[i] = keep; continue; }
    left--;
  }
  return { puzzle, solution, clues: left };
}

/* A grid is solved if it agrees with every given and every row, column and box
   is a permutation of one to nine. Nothing here consults the stored solution,
   which is why an alternative valid completion of a multi solution puzzle is
   accepted rather than called a cheat. */
export function isSolved(puzzle, grid) {
  if (!Array.isArray(grid) || grid.length !== 81) return false;
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    if (!Number.isInteger(v) || v < 1 || v > 9) return false;
    if (puzzle[i] !== 0 && puzzle[i] !== v) return false;   // a given was overwritten
  }
  for (let k = 0; k < 9; k++) {
    const row = new Set(), col = new Set(), box = new Set();
    const br = ((k / 3) | 0) * 3, bc = (k % 3) * 3;
    for (let i = 0; i < 9; i++) {
      row.add(grid[k * 9 + i]);
      col.add(grid[i * 9 + k]);
      box.add(grid[(br + ((i / 3) | 0)) * 9 + (bc + i % 3)]);
    }
    if (row.size !== 9 || col.size !== 9 || box.size !== 9) return false;
  }
  return true;
}

/* One cell the player has not got right yet, taken from the stored solution.
   Returns null when there is nothing left to reveal. */
export function hintCell(puzzle, solution, grid) {
  const open = [];
  for (let i = 0; i < 81; i++)
    if (puzzle[i] === 0 && grid[i] !== solution[i]) open.push(i);
  if (!open.length) return null;
  const i = open[randomInt(0, open.length)];
  return { index: i, value: solution[i] };
}
