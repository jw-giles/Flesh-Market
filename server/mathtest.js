/**
 * mathtest.js - Guild Numeracy Exams. Server-authoritative question engine.
 *
 * WHY THIS EXISTS
 * The old Math Quiz let the client decide both the questions and the payout. It
 * sent casino_result with whatever number it liked, capped only by CASINO_CFG
 * flat (900) and a 5 second minimum round duration, so a console one-liner was
 * worth about 900 every 5 seconds with no maths involved at all. The 5 minute
 * cooldown that was supposed to bound it lived in localStorage.
 *
 * Here the server generates the paper, keeps the answer key, times each question
 * against its own clock, grades every submission, and settles the round itself.
 * The client never receives an answer and never names a payout.
 *
 * WHAT THIS DOES NOT DO
 * It does not stop a bot. Nothing can: the server is asking a question a
 * computer answers instantly and correctly, and no latency floor separates a
 * fast human from a script without punishing the fast human. What server
 * authority buys is that earning requires actually answering, which pins the
 * maximum drain to entry fee, grade curve and cooldown. Botting becomes a
 * number the GM prices rather than an unbounded faucet. Tune EXAMS, not this.
 */

// ─── RNG helpers ─────────────────────────────────────────────────────────────
function ri(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function round2(n) { return Math.round(n * 100) / 100; }

// ─── Question shape ──────────────────────────────────────────────────────────
// { text, answer, tol, tk, tv }
//   text   English rendering, always present, used as the client fallback
//   answer numeric truth, never sent to the client until the question resolves
//   tol    absolute tolerance for grading (0.001 for integer answers)
//   tk/tv  optional i18n template key + vars so word problems render in Jade
//          mode. Symbol-only questions omit both and ship text verbatim.
//
// Every generator takes a tier 1..5 and returns one question. Tier drives range
// and shape, not just size, so tier 5 is a different kind of work from tier 1
// rather than the same sum with bigger numbers.

const GEN = {};

// Arithmetic. Tier 1-2 add and subtract, 3 adds multiply, 4 adds divide, 5 mixes
// a third operand in.
GEN.arith = (tier) => {
  const ops = tier <= 1 ? ['+', '-']
            : tier === 2 ? ['+', '-', '*']
            : tier === 3 ? ['+', '-', '*', '/']
            : ['+', '-', '*', '/'];
  const op = pick(ops);
  const r = [0, 20, 60, 150, 400, 900][tier] || 100;
  let a, b, ans, text;
  if (op === '*') {
    const cap = Math.max(3, Math.floor(Math.sqrt(r)));
    a = ri(2, cap); b = ri(2, cap); ans = a * b; text = `${a} \u00d7 ${b}`;
  } else if (op === '/') {
    b = ri(2, tier >= 4 ? 25 : 12);
    a = b * ri(2, Math.max(2, Math.floor(r / 12)));
    ans = a / b; text = `${a} \u00f7 ${b}`;
  } else if (op === '+') {
    a = ri(2, r); b = ri(2, r); ans = a + b; text = `${a} + ${b}`;
  } else {
    a = ri(2, r); b = ri(1, a); ans = a - b; text = `${a} \u2212 ${b}`;
  }
  if (tier >= 5 && (op === '+' || op === '-')) {
    const c = ri(2, Math.floor(r / 3));
    ans = ans + c; text = `${text} + ${c}`;
  }
  return { text, answer: ans, tol: 0.001 };
};

// Order of operations. The whole point is precedence, so the shapes are chosen
// to punish left-to-right evaluation.
GEN.order = (tier) => {
  const r = [0, 9, 12, 15, 20, 25][tier] || 12;
  const a = ri(2, r), b = ri(2, r), c = ri(2, r), d = ri(2, Math.max(3, Math.floor(r / 2)));
  const shapes = [
    () => ({ text: `${a} + ${b} \u00d7 ${c}`, answer: a + b * c }),
    () => ({ text: `(${a} + ${b}) \u00d7 ${c}`, answer: (a + b) * c }),
    () => ({ text: `${a} \u00d7 ${b} \u2212 ${c}`, answer: a * b - c }),
    () => ({ text: `${a * b} \u00f7 ${b} + ${c}`, answer: a + c }),
    () => ({ text: `${a} + ${b} \u00d7 ${c} \u2212 ${d}`, answer: a + b * c - d }),
    () => ({ text: `${a} \u00d7 (${b} + ${c}) \u2212 ${d}`, answer: a * (b + c) - d }),
    () => ({ text: `${a}\u00b2 + ${b} \u00d7 ${c}`, answer: a * a + b * c }),
  ];
  const usable = tier <= 2 ? shapes.slice(0, 4) : tier <= 3 ? shapes.slice(0, 6) : shapes;
  const q = pick(usable)();
  return { text: q.text, answer: q.answer, tol: 0.001 };
};

// Powers and roots. Kept to exact integers so there is never an ambiguous
// number of decimal places to type.
GEN.powers = (tier) => {
  const kinds = tier <= 2 ? ['sq', 'sqrt'] : tier <= 3 ? ['sq', 'sqrt', 'cube'] : ['sq', 'sqrt', 'cube', 'cbrt', 'pow'];
  const k = pick(kinds);
  if (k === 'sq')   { const a = ri(2, [0, 12, 20, 30, 45, 60][tier] || 20); return { text: `${a}\u00b2`, answer: a * a, tol: 0.001 }; }
  if (k === 'cube') { const a = ri(2, [0, 5, 7, 10, 14, 20][tier] || 8);    return { text: `${a}\u00b3`, answer: a * a * a, tol: 0.001 }; }
  if (k === 'sqrt') { const a = ri(2, [0, 12, 20, 30, 45, 60][tier] || 20); return { text: `\u221a${a * a}`, answer: a, tol: 0.001 }; }
  if (k === 'cbrt') { const a = ri(2, [0, 5, 7, 10, 14, 20][tier] || 8);    return { text: `\u221b${a * a * a}`, answer: a, tol: 0.001 }; }
  const base = ri(2, 6), exp = ri(2, tier >= 5 ? 5 : 4);
  return { text: `${base}^${exp}`, answer: Math.pow(base, exp), tol: 0.001 };
};

// Percentages. Numbers are chosen so every answer is a whole number, except the
// "what percent" shape which is rounded to a whole percent and says so.
GEN.percent = (tier) => {
  const kinds = tier <= 2 ? ['of'] : tier <= 3 ? ['of', 'inc'] : ['of', 'inc', 'dec', 'what'];
  const k = pick(kinds);
  const p = pick(tier <= 2 ? [10, 20, 25, 50] : tier <= 3 ? [5, 8, 12, 15, 20, 25, 30, 40] : [3, 6, 7, 12, 14, 18, 22, 35, 45, 65]);
  // n is forced to a multiple of 100/gcd(p,100) so p% of n is always a whole
  // number. Nobody should be typing 63.7 into a speed round.
  const step = 100 / gcd(p, 100);
  const n = step * ri(2, tier <= 2 ? 14 : tier <= 3 ? 30 : 60);
  if (k === 'of')  return { text: `${p}% of ${n}`, answer: n * p / 100, tol: 0.001, tk: 'casino.math.q.pctOf', tv: { p, n } };
  if (k === 'inc') return { text: `${n} increased by ${p}%`, answer: round2(n * (1 + p / 100)), tol: 0.011, tk: 'casino.math.q.pctInc', tv: { p, n } };
  if (k === 'dec') return { text: `${n} reduced by ${p}%`, answer: round2(n * (1 - p / 100)), tol: 0.011, tk: 'casino.math.q.pctDec', tv: { p, n } };
  const a = n * p / 100;
  return { text: `What percent of ${n} is ${a}? (whole percent)`, answer: p, tol: 0.001, tk: 'casino.math.q.pctWhat', tv: { b: n, a } };
};
function gcd(a, b) { return b ? gcd(b, a % b) : a; }

// Fractions. Answers are whole numbers where the fraction divides cleanly, and
// 3 decimal places where it does not, stated in the prompt.
GEN.fractions = (tier) => {
  const dens = tier <= 2 ? [2, 4, 5, 10] : tier <= 3 ? [3, 4, 5, 6, 8, 10] : [3, 6, 7, 8, 9, 12, 16];
  const den = pick(dens), num = ri(1, den - 1);
  if (tier <= 3 || Math.random() < 0.5) {
    const n = den * ri(3, tier <= 2 ? 12 : 40);
    return { text: `${num}/${den} of ${n}`, answer: n * num / den, tol: 0.001, tk: 'casino.math.q.fracOf', tv: { num, den, n } };
  }
  const d2 = pick(dens.filter(d => d !== den)) || 4, n2 = ri(1, d2 - 1);
  const ans = round3(num / den + n2 / d2);
  return { text: `${num}/${den} + ${n2}/${d2} (3 dp)`, answer: ans, tol: 0.0015, tk: 'casino.math.q.fracAdd', tv: { a: num, b: den, c: n2, d: d2 } };
};
function round3(n) { return Math.round(n * 1000) / 1000; }

// Linear algebra. Tier 4+ puts x on both sides.
GEN.algebra = (tier) => {
  const x = ri(2, tier <= 2 ? 9 : tier <= 3 ? 15 : 24);
  const a = ri(2, tier <= 2 ? 5 : 9), b = ri(1, tier <= 2 ? 12 : 40);
  if (tier <= 3) {
    const sign = Math.random() < 0.5 ? 1 : -1;
    const rhs = a * x + sign * b;
    const eq = sign > 0 ? `${a}x + ${b} = ${rhs}` : `${a}x \u2212 ${b} = ${rhs}`;
    return { text: `Solve for x: ${eq}`, answer: x, tol: 0.001, tk: 'casino.math.q.solveX', tv: { eq } };
  }
  // x on both sides:  a*x - d = c*x + k  where k = (a-c)*x - d, so x is the root
  // by construction and never needs to be solved for to generate it.
  const c = Math.max(1, ri(1, a - 1)), d = ri(1, 30);
  const k = (a - c) * x - d;
  const eq = k >= 0 ? `${a}x \u2212 ${d} = ${c}x + ${k}` : `${a}x \u2212 ${d} = ${c}x \u2212 ${Math.abs(k)}`;
  return { text: `Solve for x: ${eq}`, answer: x, tol: 0.001, tk: 'casino.math.q.solveX', tv: { eq } };
};

// Sequences. Arithmetic, geometric, and (tier 4+) second-difference.
GEN.sequence = (tier) => {
  const kinds = tier <= 2 ? ['ar'] : tier <= 3 ? ['ar', 'geo'] : ['ar', 'geo', 'quad', 'alt'];
  const k = pick(kinds);
  let terms = [], ans = 0;
  if (k === 'ar') {
    const a0 = ri(1, 20), d = ri(2, tier <= 2 ? 9 : 17) * (tier >= 4 && Math.random() < 0.35 ? -1 : 1);
    for (let i = 0; i < 5; i++) terms.push(a0 + d * i);
    ans = a0 + d * 5;
  } else if (k === 'geo') {
    const a0 = ri(1, 6), r = ri(2, tier >= 4 ? 4 : 3);
    for (let i = 0; i < 5; i++) terms.push(a0 * Math.pow(r, i));
    ans = a0 * Math.pow(r, 5);
  } else if (k === 'quad') {
    const a0 = ri(1, 8), d = ri(1, 5), dd = ri(1, 4);
    let cur = a0, step = d;
    for (let i = 0; i < 5; i++) { terms.push(cur); cur += step; step += dd; }
    ans = cur;
  } else {
    const a0 = ri(2, 12), d = ri(2, 9);
    for (let i = 0; i < 5; i++) terms.push((a0 + d * i) * (i % 2 === 0 ? 1 : -1));
    ans = (a0 + d * 5) * (5 % 2 === 0 ? 1 : -1);
  }
  const seq = terms.join(', ');
  return { text: `Next term: ${seq}, ?`, answer: ans, tol: 0.001, tk: 'casino.math.q.nextTerm', tv: { seq } };
};

// Ratios and unit rates. Priced in Social Credits so it reads as guild work.
GEN.ratio = (tier) => {
  const unit = ri(2, tier <= 2 ? 12 : 60);
  const n = ri(2, 9) * (tier <= 2 ? 1 : ri(1, 4));
  const m = ri(2, tier <= 3 ? 15 : 40);
  const cost = unit * n;
  if (tier <= 3 || Math.random() < 0.5) {
    return { text: `${n} units cost \u0192${cost}. Price of ${m} units?`,
             answer: unit * m, tol: 0.001, tk: 'casino.math.q.unitRate', tv: { n, c: cost, m } };
  }
  const shares = ri(3, 40), price = ri(4, 90);
  const budget = shares * price + ri(0, price - 1);
  return { text: `\u0192${budget} buys how many whole shares at \u0192${price}?`,
           answer: Math.floor(budget / price), tol: 0.001, tk: 'casino.math.q.wholeShares', tv: { c: budget, p: price } };
};

// Interest. Simple at low tier, compounded annually above it.
GEN.interest = (tier) => {
  const p = ri(2, 40) * 100;
  const r = pick([2, 3, 4, 5, 6, 8, 10, 12]);
  const y = ri(2, tier >= 4 ? 6 : 4);
  if (tier <= 3) {
    return { text: `\u0192${p} at ${r}% simple interest for ${y} years. Interest earned?`,
             answer: round2(p * r / 100 * y), tol: 0.011, tk: 'casino.math.q.simpleInt', tv: { p, r, y } };
  }
  const fv = Math.round(p * Math.pow(1 + r / 100, y));
  return { text: `\u0192${p} at ${r}% compounded annually for ${y} years. Final value, nearest \u01921?`,
           answer: fv, tol: 0.5, tk: 'casino.math.q.compoundInt', tv: { p, r, y } };
};

// Trading word problems. Same maths as the rest, dressed in the game's own
// vocabulary so the exam reads like guild work rather than a worksheet.
GEN.wordpnl = (tier) => {
  const kinds = tier <= 3 ? ['pnl', 'margin'] : ['pnl', 'margin', 'fee', 'breakeven'];
  const k = pick(kinds);
  if (k === 'pnl') {
    const q = ri(2, tier <= 3 ? 20 : 90), b = ri(3, 60), s = b + ri(1, 30);
    return { text: `Bought ${q} at \u0192${b}, sold at \u0192${s}. Net profit?`,
             answer: q * (s - b), tol: 0.001, tk: 'casino.math.q.pnl', tv: { q, b, s } };
  }
  if (k === 'margin') {
    const c = ri(2, 40) * 5, s = c + ri(1, 20) * 5;
    return { text: `Cost \u0192${c}, sells for \u0192${s}. Margin percent, nearest 1%?`,
             answer: Math.round((s - c) / s * 100), tol: 0.6, tk: 'casino.math.q.margin', tv: { c, s } };
  }
  if (k === 'fee') {
    const gross = ri(5, 90) * 100, fee = pick([1, 2, 3, 5]);
    return { text: `Gross \u0192${gross} less a ${fee}% guild fee. Net received?`,
             answer: round2(gross * (1 - fee / 100)), tol: 0.011, tk: 'casino.math.q.feeNet', tv: { g: gross, f: fee } };
  }
  const q2 = ri(3, 40), b2 = ri(5, 70), fee2 = pick([2, 4, 5]);
  const be = Math.ceil(b2 / (1 - fee2 / 100) * 100) / 100;
  return { text: `Bought ${q2} at \u0192${b2}. With a ${fee2}% sale fee, break even sale price, 2 dp?`,
           answer: be, tol: 0.011, tk: 'casino.math.q.breakeven', tv: { q: q2, b: b2, f: fee2 } };
};

export const TOPICS = [
  { id: 'arith',     name: 'Arithmetic' },
  { id: 'order',     name: 'Order of Operations' },
  { id: 'powers',    name: 'Powers and Roots' },
  { id: 'percent',   name: 'Percentages' },
  { id: 'fractions', name: 'Fractions' },
  { id: 'algebra',   name: 'Algebra' },
  { id: 'sequence',  name: 'Sequences' },
  { id: 'ratio',     name: 'Ratios and Rates' },
  { id: 'interest',  name: 'Interest' },
  { id: 'wordpnl',   name: 'Trade Problems' },
];
const TOPIC_IDS = new Set(TOPICS.map(t => t.id));

// ─── Grade curve ─────────────────────────────────────────────────────────────
// Applied to accrued earnings at settlement, not to the entry fee. Everything
// below 60% pays nothing, so a paid paper is a skill wager rather than a
// faucet. Break even on every paid exam sits between 65% and 75%.
export const GRADES = [
  { min: 1.00, mult: 2.00, label: 'S' },
  { min: 0.90, mult: 1.55, label: 'A' },
  { min: 0.80, mult: 1.20, label: 'B' },
  { min: 0.70, mult: 0.95, label: 'C' },
  { min: 0.60, mult: 0.60, label: 'D' },
  { min: 0.00, mult: 0.00, label: 'F' },
];
export function gradeFor(pct) {
  for (const g of GRADES) if (pct >= g.min - 1e-9) return g;
  return GRADES[GRADES.length - 1];
}

// ─── Exams ───────────────────────────────────────────────────────────────────
// One table, five papers. This is the tuning surface: everything the economy
// feels about this feature is a number here, not logic elsewhere.
//
//   game        casino_rounds key, one per exam so cooldowns, caps and the
//               certification gate are all per paper without a new table
//   entry       committed at start, forfeit on abandon exactly like a loss
//   perQ        accrued per correct answer, multiplied by the question's tier
//               weight below, then by the grade multiplier at settlement
//   maxGross    the CASINO_CFG backstop cap; set from the table, not by hand
const TIER_WEIGHT = { 1: 0.6, 2: 0.85, 3: 1.0, 4: 1.45, 5: 2.1 };

export const EXAMS = [
  {
    id: 'drill', game: 'math_drill',
    name: 'Numeracy Drill', desc: 'Free practice. Pick a topic or take it mixed. Small pay, short cooldown.',
    entry: 0, count: 10, tiers: [1, 2], perQ: 8, timeSec: 20,
    topics: null,            // null means player choice, defaults to mixed
    cooldownMs: 4 * 60_000, timeoutMs: 12 * 60_000, gate: null,
  },
  {
    id: 'ledger', game: 'math_ledger',
    name: 'Ledger Clerk Paper', desc: 'Twelve questions on counting, parts and percentages. Pass mark pays.',
    entry: 150, count: 12, tiers: [2, 3], perQ: 24, timeSec: 26,
    topics: ['arith', 'order', 'percent', 'fractions'],
    cooldownMs: 8 * 60_000, timeoutMs: 20 * 60_000, gate: null,
  },
  {
    id: 'speed', game: 'math_speed',
    name: 'Speed Reckoning', desc: 'Twenty four questions on a short clock. Every fifth answer in a row pays a streak bonus.',
    entry: 250, count: 24, tiers: [2, 3], perQ: 16, timeSec: 9,
    topics: ['arith', 'order', 'powers'],
    streakEvery: 5, streakBonus: 40,
    cooldownMs: 10 * 60_000, timeoutMs: 15 * 60_000, gate: null,
  },
  {
    id: 'broker', game: 'math_broker',
    name: 'Broker Certification', desc: 'Sixteen questions on rates, interest and trade problems. Passing this unlocks the board exam.',
    entry: 700, count: 16, tiers: [3, 4], perQ: 62, timeSec: 40,
    topics: ['percent', 'ratio', 'interest', 'algebra', 'sequence', 'wordpnl'],
    cooldownMs: 15 * 60_000, timeoutMs: 30 * 60_000, gate: null,
  },
  {
    id: 'quant', game: 'math_quant',
    name: 'Quant Board Exam', desc: 'Twenty questions across every topic at full difficulty. Requires a passing Broker Certification.',
    entry: 2500, count: 20, tiers: [4, 5], perQ: 108, timeSec: 55,
    topics: null,            // null with fixedMixed means all topics
    fixedMixed: true,
    cooldownMs: 30 * 60_000, timeoutMs: 45 * 60_000, gate: { game: 'math_broker', reason: 'broker' },
  },
];
export const EXAM_BY_ID = new Map(EXAMS.map(e => [e.id, e]));
export const EXAM_BY_GAME = new Map(EXAMS.map(e => [e.game, e]));

// Theoretical ceiling for one sitting: every question correct at the top tier,
// every streak bonus, top grade multiplier. Used as the CASINO_CFG flat cap so
// a generator bug still cannot overpay, and shown to the player as the headline
// number. Derived, never typed, so retuning perQ moves the cap with it.
export function maxGross(exam) {
  const topTier = exam.tiers[exam.tiers.length - 1];
  // Math.round, not the raw product. buildPaper rounds each reward, and rounding
  // up is the common case: a drill question at perQ 8 and weight 0.85 is 6.8,
  // paid as 7. Ten of those is 70 against a cap computed from 68, which clamps a
  // flawless paper and pays the best player in the game less than the table
  // promised. Same arithmetic on both sides or the cap is not a backstop.
  const perQ = Math.round(exam.perQ * (TIER_WEIGHT[topTier] || 1));
  const streak = exam.streakEvery ? Math.floor(exam.count / exam.streakEvery) * exam.streakBonus : 0;
  return Math.ceil((exam.count * perQ + streak) * GRADES[0].mult);
}

// ─── Paper generation ────────────────────────────────────────────────────────
export function buildPaper(exam, chosenTopic) {
  // Three cases, in priority order, and no fallthrough between them. The first
  // draft resolved 'mixed' by testing TOPIC_IDS.has('mixed'), which is false, so
  // every "mixed" drill was silently ten arithmetic questions. It looked like a
  // run of bad luck rather than a bug, which is the worst way for this to fail.
  let pool;
  if (exam.fixedMixed) pool = TOPICS.map(t => t.id);                 // all topics, not negotiable
  else if (exam.topics) pool = exam.topics.slice();                  // fixed syllabus
  else if (chosenTopic && TOPIC_IDS.has(chosenTopic)) pool = [chosenTopic];  // player picked one
  else pool = TOPICS.map(t => t.id);                                 // player choice, mixed or unset

  // Spread topics evenly rather than sampling independently, so a 12 question
  // paper over 4 topics is 3 of each and not, one time in a thousand, 12 of one.
  const order = [];
  while (order.length < exam.count) for (const t of shuffle(pool)) { if (order.length < exam.count) order.push(t); }

  const questions = [];
  for (let i = 0; i < exam.count; i++) {
    const topic = order[i];
    const tier = exam.tiers[ri(0, exam.tiers.length - 1)];
    const gen = GEN[topic] || GEN.arith;
    let q;
    try { q = gen(tier); } catch (_) { q = GEN.arith(tier); }
    const weight = TIER_WEIGHT[tier] || 1;
    questions.push({
      i, topic, tier,
      text: q.text, tk: q.tk || null, tv: q.tv || null,
      answer: q.answer,
      tol: q.tol == null ? 0.001 : q.tol,
      timeSec: Math.max(5, Math.round(exam.timeSec * (tier >= 4 ? 1.25 : 1))),
      reward: Math.round(exam.perQ * weight),
    });
  }
  return questions;
}

// Strip the answer key before anything crosses the socket. Every send of a
// question goes through here; there is deliberately no other path.
export function publicQuestion(q, total) {
  return {
    i: q.i, total, topic: q.topic, tier: q.tier,
    text: q.text, tk: q.tk, tv: q.tv,
    timeSec: q.timeSec, reward: q.reward,
  };
}

export function isCorrect(q, value) {
  if (value === null || value === undefined) return false;
  const v = Number(value);
  if (!Number.isFinite(v)) return false;
  return Math.abs(v - q.answer) <= (q.tol || 0.001);
}

export function topicName(id) {
  const t = TOPICS.find(x => x.id === id);
  return t ? t.name : id;
}
