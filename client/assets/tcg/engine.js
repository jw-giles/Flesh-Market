'use strict';
/*
  FleshMarket TCG - core rules engine (v1 skeleton)

  Design contract:
  - Server-authoritative. Every mutation goes through an engine action that
    validates legality first. Nothing trusts client-reported state. This is the
    opposite of the existing casino handler (which trusts msg.sync).
  - Deterministic. Given a seed and an identical action sequence, the engine
    produces an identical game. No Math.random in the engine; randomness is
    injected via a seeded RNG so games are replayable and testable.
  - Event-driven. Actions emit events; card triggers react to events; reactions
    emit more events. Keywords are triggers, not special cases baked into combat.
    Adding the 50th keyword is a card definition plus (sometimes) a small helper,
    never a new branch in attack()/playCard().
  - The engine knows nothing about UI, network, AI, or the database. It takes
    actions in and returns a structured log out. Those logs drive client
    animation later and drive the test assertions now.

  Not in this slice (deliberate, named so scope is honest):
  - Dynamic auras ("+1 attack to ALL friendly units" that updates live). v1 buffs
    are one-time enchantments. Aura support is an extension point (see applyAuras).
  - Hero powers, secrets, mulligan, weapons, overload. All additive later.
  - AI opponent and matchmaking. The engine is opponent-agnostic on purpose;
    PvE/ghost AI and (later) live PvP both drive it through the same action API.
*/

// ---- themed display labels (flavor lives here; engine fields stay generic) ----
const FLAVOR = {
  health: 'Solvency',     // hero health. 0 = Liquidation.
  mana: 'Liquidity',      // per-turn resource. Grows each turn, refreshes.
  unit: 'Asset',          // board card type
  tactic: 'Order',        // one-shot spell type
  deck: 'Portfolio',
  graveyard: 'Writeoffs',
};

const MAX_MANA = 10;
const BOARD_CAP = 7;
const HAND_CAP = 10;
const START_HEALTH = 30;

// ---- seeded RNG (mulberry32) as PLAIN STATE on the engine, not a closure, so a
// game is a copyable data snapshot. _rng() advances this._rngState. This is what
// makes clone() possible (for the AI) and, later, save/replay on the server.

class Engine {
  constructor(cardDb, opts = {}) {
    this.db = cardDb;                 // defId -> card definition
    this._rngState = ((opts.seed ?? 1) >>> 0) || 0x9e3779b9;
    this.nextEid = 1;
    this.turnNumber = 0;
    this.active = 0;                  // index of player whose turn it is
    this.winner = null;               // null | 0 | 1 | 'draw'
    this.log = [];                    // structured event log (client + tests)
    this._triggerQueue = [];          // pending reactive effects
    this._resolving = false;
    this.players = [this._mkPlayer(0), this._mkPlayer(1)];
    this.players[0].hero.eid = this._eid();   // heroes get distinct ids up front,
    this.players[1].hero.eid = this._eid();   // so target resolution is never ambiguous
  }

  _mkPlayer(idx) {
    return {
      idx,
      hero: { eid: 0, kind: 'hero', owner: idx, controller: idx, zone: 'hero',
              health: START_HEALTH, maxHealth: START_HEALTH },
      hand: [], deck: [], board: [], graveyard: [],
      mana: 0, maxMana: 0, fatigue: 0,
    };
  }

  // mulberry32 over plain state
  _rng() {
    let a = this._rngState | 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    this._rngState = a;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Deep copy of the mutable game state, sharing the (immutable) card defs.
  // Used by the AI to simulate candidate actions without touching the real game.
  // The clone carries an empty log for speed; nothing in the engine reads the log.
  clone() {
    const c = Object.create(Engine.prototype);
    c.db = this.db;
    c._rngState = this._rngState;
    c.nextEid = this.nextEid;
    c.turnNumber = this.turnNumber;
    c.active = this.active;
    c.winner = this.winner;
    c.log = [];
    c._triggerQueue = [];
    c._resolving = false;
    c.players = this.players.map(_clonePlayer);
    return c;
  }

  // ---- setup ----
  // decks: [[defId,...], [defId,...]] bottom-to-top. We shuffle each.
  setupGame(decks) {
    decks.forEach((list, p) => {
      const ents = list.map((defId) => this._mkEntity(defId, p, 'deck'));
      this.players[p].deck = this._shuffle(ents);
    });
    // opening hands: 3 each (skip coin/mulligan for v1)
    for (let p = 0; p < 2; p++) for (let i = 0; i < 3; i++) this._drawRaw(p);
    this._emit('GAME_START', {});
  }

  _eid() { return this.nextEid++; }

  _mkEntity(defId, owner, zone) {
    const def = this.db[defId];
    if (!def) throw new Error('unknown card def: ' + defId);
    const e = {
      eid: this._eid(), defId, def, owner, controller: owner, zone,
      kind: def.type, // 'unit' | 'tactic'
    };
    if (def.type === 'unit') {
      e.attack = def.attack | 0;
      e.maxHealth = def.health | 0;
      e.health = def.health | 0;
      e.taunt = !!(def.keywords && def.keywords.includes('taunt'));
      e.rush = !!(def.keywords && def.keywords.includes('rush'));
      e.charge = !!(def.keywords && def.keywords.includes('charge'));
      e.windfury = !!(def.keywords && def.keywords.includes('windfury'));
      e.divineShield = !!(def.keywords && def.keywords.includes('divine shield'));
      e.frozen = false;
      e.attacksThisTurn = 0;
      e.summonedTurn = -1;
      e.enchantments = [];
      e.dead = false;
    }
    return e;
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---- event bus ----
  // emit records the event, then scans every in-play entity for triggers whose
  // `on` matches. Matching triggers are queued (not run inline) so cascades
  // resolve in a stable FIFO order. resolveTriggers() drains the queue; handlers
  // may emit more events, which enqueue more triggers, until the queue empties.
  _emit(type, payload) {
    const ev = Object.assign({ type }, payload);
    this.log.push(ev);
    for (const e of this._allInPlay()) {
      const trigs = e.def.triggers;
      if (!trigs) continue;
      for (const t of trigs) {
        if (t.on !== type) continue;
        this._triggerQueue.push({ entity: e, trig: t, event: ev });
      }
    }
    if (!this._resolving) this._resolveTriggers();
    return ev;
  }

  _resolveTriggers() {
    this._resolving = true;
    let guard = 0;
    while (this._triggerQueue.length) {
      if (++guard > 1000) { this.log.push({ type: 'ENGINE_GUARD_TRIP' }); break; }
      const { entity, trig, event } = this._triggerQueue.shift();
      if (entity.dead && trig.on !== 'UNIT_DIED') continue; // dead units stop reacting
      try { trig.handler(this._ctx(entity, null), event); }
      catch (err) { this.log.push({ type: 'TRIGGER_ERROR', defId: entity.defId, err: String(err) }); }
    }
    this._resolving = false;
  }

  _allInPlay() {
    // entities that can hold triggers: units on board. (Heroes/secrets later.)
    return [...this.players[0].board, ...this.players[1].board];
  }

  // ---- context handed to card effect functions ----
  // Keeps card code short and forces all mutation through engine helpers, so
  // every effect emits the right events and respects the death loop.
  _ctx(self, target) {
    const G = this;
    const myIdx = self ? self.controller : this.active;
    return {
      self, target,
      me: this.players[myIdx],
      foe: this.players[1 - myIdx],
      rngInt: (n) => Math.floor(G._rng() * n),
      damage: (src, tgt, amt) => G.dealDamage(src, tgt, amt),
      heal: (tgt, amt) => G.heal(tgt, amt),
      draw: (idx, n) => { for (let i = 0; i < (n || 1); i++) G._drawRaw(idx); },
      buff: (tgt, atk, hp, opts) => G.buff(tgt, atk, hp, opts),
      summon: (defId, idx, side) => G.summon(defId, idx, side),
      destroy: (tgt) => G.destroy(tgt),
      enemyUnits: (idx) => G.players[1 - idx].board.slice(),
      friendlyUnits: (idx) => G.players[idx].board.slice(),
      enemyHero: (idx) => G.players[1 - idx].hero,
      randomEnemyUnit: (idx) => {
        const u = G.players[1 - idx].board;
        return u.length ? u[Math.floor(G._rng() * u.length)] : null;
      },
    };
  }

  // ---- core mutators (all emit events; callers run deathSweep after) ----
  dealDamage(source, target, amount) {
    if (!target || amount <= 0) return;
    // source-inherent keywords (work for units and tactics; read from def)
    const skw = (source && source.def && source.def.keywords) || [];
    const lifesteal = skw.includes('lifesteal');
    const poisonous = skw.includes('poisonous');
    const drain = (dealt) => { if (lifesteal && dealt > 0 && source) this.heal(this.players[source.controller].hero, dealt); };

    if (target.kind === 'hero') {
      target.health -= amount;
      this._emit('DAMAGE_DEALT', { target: target.eid, targetKind: 'hero', owner: target.owner, amount,
                                   source: source ? source.eid : null });
      drain(amount);
      this._checkWin();
    } else {
      if (target.dead || target.zone !== 'board') return;
      if (target.divineShield) {            // absorbs the whole instance: no damage, no lifesteal, no poison
        target.divineShield = false;
        this._emit('SHIELD_POPPED', { target: target.eid });
        return;
      }
      target.health -= amount;
      this._emit('DAMAGE_DEALT', { target: target.eid, targetKind: 'unit', amount,
                                   source: source ? source.eid : null });
      drain(amount);
      if (poisonous) target.dead = true;    // any damage from a poisonous source destroys
      if (target.health <= 0) target.dead = true; // swept later
    }
  }

  heal(target, amount) {
    if (!target || amount <= 0) return;
    const before = target.health;
    target.health = Math.min(target.maxHealth, target.health + amount);
    const healed = target.health - before;
    if (healed > 0) this._emit('HEALED', { target: target.eid, amount: healed });
  }

  buff(target, atk = 0, hp = 0, opts = {}) {
    if (!target || target.kind !== 'unit' || target.zone !== 'board') return;
    target.attack += atk;
    target.maxHealth += hp;
    target.health += hp;
    if (opts.thisTurn) target.enchantments.push({ atk, hp, expires: 'endTurn' });
    this._emit('STAT_CHANGED', { target: target.eid, atk, hp, thisTurn: !!opts.thisTurn });
  }

  destroy(target) {
    if (!target || target.kind !== 'unit' || target.zone !== 'board') return;
    target.dead = true;
    this._emit('MARKED_DESTROY', { target: target.eid });
  }

  summon(defId, idx, side) {
    const board = this.players[idx].board;
    if (board.length >= BOARD_CAP) return null;
    const e = this._mkEntity(defId, idx, 'board');
    e.summonedTurn = this.turnNumber;
    e.attacksThisTurn = 0;
    if (typeof side === 'number') board.splice(side, 0, e); else board.push(e);
    this._emit('UNIT_SUMMONED', { eid: e.eid, defId, owner: idx });
    return e;
  }

  // ---- draw / fatigue ----
  _drawRaw(idx) {
    const pl = this.players[idx];
    if (pl.deck.length === 0) {
      pl.fatigue += 1;
      this.players[idx].hero.health -= pl.fatigue;
      this._emit('FATIGUE', { player: idx, amount: pl.fatigue });
      this._checkWin();
      return null;
    }
    const card = pl.deck.pop();
    if (pl.hand.length >= HAND_CAP) {
      card.zone = 'graveyard'; pl.graveyard.push(card);
      this._emit('CARD_BURNED', { player: idx, defId: card.defId }); // hand full
      return null;
    }
    card.zone = 'hand'; pl.hand.push(card);
    this._emit('CARD_DRAWN', { player: idx, eid: card.eid, defId: card.defId });
    return card;
  }

  // ---- turn flow ----
  startTurn(idx) {
    this.active = idx;
    this.turnNumber += 1;
    const pl = this.players[idx];
    pl.maxMana = Math.min(MAX_MANA, pl.maxMana + 1);
    pl.mana = pl.maxMana;
    for (const u of pl.board) { u.attacksThisTurn = 0; u.frozen = false; }
    this._emit('TURN_START', { player: idx, turn: this.turnNumber });
    this._drawRaw(idx);
    this._deathSweep();
  }

  endTurn() {
    const idx = this.active;
    const pl = this.players[idx];
    // expire "this turn" enchantments on the active player's units
    for (const u of pl.board) {
      if (!u.enchantments.length) continue;
      const keep = [];
      for (const en of u.enchantments) {
        if (en.expires === 'endTurn') {
          u.attack -= en.atk;
          u.maxHealth -= en.hp;
          u.health = Math.min(u.health, u.maxHealth);
        } else keep.push(en);
      }
      u.enchantments = keep;
    }
    this._emit('TURN_END', { player: idx });
    this._deathSweep();
    if (this.winner === null) this.startTurn(1 - idx);
  }

  // ---- death processing ----
  // After any action, sweep for dead units. Move them to graveyard in summon
  // order, emit UNIT_DIED (which enqueues deathrattles via the bus), drain, and
  // repeat until the board is stable. This is where chains resolve correctly:
  // a board-clear that kills five units fires five deathrattles in order, and if
  // those deathrattles kill more, those get swept on the next pass.
  _deathSweep() {
    let guard = 0;
    for (;;) {
      if (++guard > 100) { this.log.push({ type: 'DEATH_GUARD_TRIP' }); break; }
      const dead = [];
      for (let p = 0; p < 2; p++)
        for (const u of this.players[p].board)
          if (u.dead || u.health <= 0) dead.push(u);
      if (dead.length === 0) break;
      dead.sort((a, b) => a.eid - b.eid); // deterministic resolution order
      for (const u of dead) {
        const pl = this.players[u.controller];
        const i = pl.board.indexOf(u);
        if (i >= 0) pl.board.splice(i, 1);
        u.zone = 'graveyard'; u.dead = true; pl.graveyard.push(u);
        this._emit('UNIT_DIED', { eid: u.eid, defId: u.defId, owner: u.controller });
        if (u.def.deathrattle) {
          try { u.def.deathrattle(this._ctx(u, null)); }
          catch (err) { this.log.push({ type: 'DEATHRATTLE_ERROR', defId: u.defId, err: String(err) }); }
        }
      }
    }
    this._applyAuras();
    this._checkWin();
  }

  // Extension point for dynamic auras. v1: no-op. When added, this recomputes
  // continuous buffs from scratch each sweep (clear aura enchantments, reapply
  // from every aura source currently in play).
  _applyAuras() { /* v1 intentionally empty */ }

  // ---- win check ----
  _checkWin() {
    if (this.winner !== null) return;
    const d0 = this.players[0].hero.health <= 0;
    const d1 = this.players[1].hero.health <= 0;
    if (d0 && d1) this.winner = 'draw';
    else if (d1) this.winner = 0;
    else if (d0) this.winner = 1;
    if (this.winner !== null) this._emit('GAME_OVER', { winner: this.winner });
  }

  // ===================== PUBLIC ACTIONS (validated) =====================
  // Each returns { ok:true } or { ok:false, error }. On ok the mutation already
  // happened and is reflected in this.log (slice from a pre-action marker to get
  // just this action's events).

  _err(msg) { return { ok: false, error: msg }; }

  canPlay(idx, eid, targetEid) {
    if (this.winner !== null) return this._err('game over');
    if (idx !== this.active) return this._err('not your turn');
    const pl = this.players[idx];
    const card = pl.hand.find((c) => c.eid === eid);
    if (!card) return this._err('card not in hand');
    if (card.def.cost > pl.mana) return this._err('not enough ' + FLAVOR.mana);
    if (card.kind === 'unit' && pl.board.length >= BOARD_CAP) return this._err('board full');
    const need = card.def.targeting;
    if (need) {
      const tgt = this._resolveTarget(idx, targetEid);
      if (!tgt) return this._err('a target is required');
      if (!this._targetLegal(idx, need, tgt)) return this._err('illegal target');
    }
    return { ok: true, card };
  }

  playCard(idx, eid, targetEid) {
    const chk = this.canPlay(idx, eid, targetEid);
    if (!chk.ok) return chk;
    const pl = this.players[idx];
    const card = chk.card;
    pl.mana -= card.def.cost;
    pl.hand.splice(pl.hand.indexOf(card), 1);
    const target = card.def.targeting ? this._resolveTarget(idx, targetEid) : null;

    if (card.kind === 'unit') {
      card.zone = 'board';
      card.summonedTurn = this.turnNumber;
      card.attacksThisTurn = 0;
      pl.board.push(card);
      this._emit('CARD_PLAYED', { player: idx, eid: card.eid, defId: card.defId, kind: 'unit' });
      this._emit('UNIT_SUMMONED', { eid: card.eid, defId: card.defId, owner: idx });
      if (card.def.battlecry) {
        try { card.def.battlecry(this._ctx(card, target)); }
        catch (err) { this.log.push({ type: 'BATTLECRY_ERROR', defId: card.defId, err: String(err) }); }
      }
    } else {
      this._emit('CARD_PLAYED', { player: idx, eid: card.eid, defId: card.defId, kind: 'tactic' });
      if (card.def.battlecry) {
        try { card.def.battlecry(this._ctx(card, target)); }
        catch (err) { this.log.push({ type: 'TACTIC_ERROR', defId: card.defId, err: String(err) }); }
      }
      card.zone = 'graveyard'; pl.graveyard.push(card);
    }
    this._deathSweep();
    return { ok: true };
  }

  canAttack(idx, attackerEid, defenderEid) {
    if (this.winner !== null) return this._err('game over');
    if (idx !== this.active) return this._err('not your turn');
    const a = this.players[idx].board.find((u) => u.eid === attackerEid);
    if (!a) return this._err('attacker not found');
    if (a.attack <= 0) return this._err('0 attack cannot attack');
    if (a.frozen) return this._err('frozen');
    if (a.attacksThisTurn >= (a.windfury ? 2 : 1)) return this._err('already attacked');
    const sick = a.summonedTurn === this.turnNumber && !a.charge && !a.rush;
    if (sick) return this._err('summoning sickness');

    const foe = this.players[1 - idx];
    const def = (defenderEid === foe.hero.eid)
      ? foe.hero
      : foe.board.find((u) => u.eid === defenderEid);
    if (!def) return this._err('defender not found');
    // rush cannot hit the enemy hero on the turn it is summoned
    if (def.kind === 'hero' && a.rush && !a.charge && a.summonedTurn === this.turnNumber)
      return this._err('rush cannot hit hero this turn');
    // taunt: if any enemy taunt unit exists, the defender must be a taunt unit
    const taunts = foe.board.filter((u) => u.taunt && !u.dead);
    if (taunts.length && !(def.kind === 'unit' && def.taunt))
      return this._err('must attack a taunt ' + FLAVOR.unit);
    return { ok: true, a, def };
  }

  attack(idx, attackerEid, defenderEid) {
    const chk = this.canAttack(idx, attackerEid, defenderEid);
    if (!chk.ok) return chk;
    const { a, def } = chk;
    this._emit('ATTACK_DECLARED', { attacker: a.eid, defender: def.eid });
    const aDmg = a.attack;
    const dDmg = def.kind === 'unit' ? def.attack : 0; // heroes do not strike back
    // simultaneous strike
    this.dealDamage(a, def, aDmg);
    if (dDmg > 0) this.dealDamage(def, a, dDmg);
    a.attacksThisTurn += 1;
    this._deathSweep();
    return { ok: true };
  }

  // ---- targeting helpers ----
  _resolveTarget(idx, targetEid) {
    if (targetEid == null) return null;
    for (let p = 0; p < 2; p++) {
      if (this.players[p].hero.eid === targetEid) return this.players[p].hero;
      const u = this.players[p].board.find((x) => x.eid === targetEid);
      if (u) return u;
    }
    return null;
  }

  _targetLegal(idx, need, tgt) {
    const isEnemy = tgt.controller !== undefined ? tgt.controller !== idx : tgt.owner !== idx;
    switch (need) {
      case 'any': return true;
      case 'any_unit': return tgt.kind === 'unit';
      case 'enemy': return isEnemy;
      case 'friendly': return !isEnemy;
      case 'enemy_unit': return tgt.kind === 'unit' && isEnemy;
      case 'friendly_unit': return tgt.kind === 'unit' && !isEnemy;
      default: return false;
    }
  }

  // ---- read-only snapshot for clients / AI ----
  view(forIdx) {
    const pub = (e) => ({ eid: e.eid, defId: e.defId, name: e.def.name, kind: e.kind,
      attack: e.attack, health: e.health, maxHealth: e.maxHealth,
      taunt: e.taunt, rush: e.rush, frozen: e.frozen,
      canAttack: e.kind === 'unit' && e.controller === this.active &&
                 e.attacksThisTurn < 1 && e.attack > 0 && !e.frozen &&
                 !(e.summonedTurn === this.turnNumber && !e.charge && !e.rush) });
    const side = (p) => ({
      hero: { eid: this.players[p].hero.eid, health: this.players[p].hero.health },
      board: this.players[p].board.map(pub),
      handCount: this.players[p].hand.length,
      deckCount: this.players[p].deck.length,
      mana: this.players[p].mana, maxMana: this.players[p].maxMana,
    });
    const v = { turn: this.turnNumber, active: this.active, winner: this.winner,
      you: side(forIdx), foe: side(1 - forIdx) };
    // your hand is visible to you; opponent hand is hidden (count only)
    v.you.hand = this.players[forIdx].hand.map((c) => ({ eid: c.eid, defId: c.defId,
      name: c.def.name, cost: c.def.cost, kind: c.kind, text: c.def.text,
      attack: c.def.attack, health: c.def.health, targeting: c.def.targeting || null }));
    return v;
  }
}

// ---- deep-copy helpers for clone() (defs are shared; everything else copied) ----
function _cloneEntity(e) {
  const n = Object.assign({}, e);
  if (e.enchantments) n.enchantments = e.enchantments.map((x) => Object.assign({}, x));
  return n;
}
function _clonePlayer(p) {
  return {
    idx: p.idx,
    hero: Object.assign({}, p.hero),
    hand: p.hand.map(_cloneEntity),
    deck: p.deck.map(_cloneEntity),
    board: p.board.map(_cloneEntity),
    graveyard: p.graveyard.map(_cloneEntity),
    mana: p.mana, maxMana: p.maxMana, fatigue: p.fatigue,
  };
}

const _engineApi = { Engine, FLAVOR, MAX_MANA, BOARD_CAP, START_HEALTH };
if (typeof module !== 'undefined' && module.exports) module.exports = _engineApi;
if (typeof window !== 'undefined') window.FleshTCGEngine = _engineApi;
