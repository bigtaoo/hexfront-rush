'use strict';
// Deterministic lockstep simulation for Hexfront Rush.
//
// Contract (after Holy Kicker's engine): the whole match is a pure function of
// (config, command stream). step(cmds) advances exactly one tick of 1/TICK_RATE s; state is
// integers only (fixed point, ticks, ids); randomness comes from named Prng streams; nothing
// reads the clock, the DOM or Math.random. Two machines that feed the same commands at the
// same ticks compute the same hash() at every tick, which is what online lockstep, replays,
// snapshots and the golden tests rely on. Entities reference each other by id, never by object,
// so the state serialises as plain data. The sim emits events (with fixed-point positions and
// teams) and the view decides what to draw or play: no effects, strings or audio live here.

class Engine {
  /** config: { seed, aiBlue, aiRed } - which teams the built-in AI drives. */
  constructor(config) {
    this.config = { seed: config.seed >>> 0, aiBlue: !!config.aiBlue, aiRed: !!config.aiRed };
    const seed = this.config.seed;
    const m = generateMap(seed);
    this.tiles = m.tiles;
    this.theme = m.theme;
    this.themeKey = m.themeKey;
    this.flow = [null, this.distanceField(baseTile(TEAM_BLUE)), this.distanceField(baseTile(TEAM_RED))];

    this.rng = {
      offer: new Prng(streamSeed(seed, 2)), loot: new Prng(streamSeed(seed, 3)),
      unit: new Prng(streamSeed(seed, 4)), chest: new Prng(streamSeed(seed, 5)),
      ai1: new Prng(streamSeed(seed, 6)), ai2: new Prng(streamSeed(seed, 7)),
      quest: new Prng(streamSeed(seed, 8)),
    };
    this.tick = 0;
    this.phase = PHASE_INTRO;
    this.introT = INTRO_TICKS;
    this.timeT = MATCH_TICKS;
    this.lastCount = 4;
    this.lastTick = 11;
    this.alerted = 0;
    this.chestT = CHEST.first;
    this.nextId = 1;
    this.result = null;
    this.units = [];
    this.blds = [];
    this.projs = [];
    this.events = [];
    this.ents = new Map();   // id -> entity; lookup only, never walked (rebuilt on restore)

    this.team = [null];
    for (const t of TEAMS) {
      this.team.push({ gold: 60, tiles: 0, units: 0, built: { mine: 0, tower: 0, barracks: 0, mystery: 0 },
        offers: new Array(NTILES).fill(-1), questIdx: 0, questT: -1000 });
    }
    for (const t of TEAMS) {
      const bt = this.tiles[baseTile(t)];
      bt.owner = t;
      for (const n of bt.nb) if (!this.tiles[n].obst) this.tiles[n].owner = t;
      this.addBuilding(t, 'base', bt.i, null);
    }
    this.heroes = [null, this.makeHero(TEAM_BLUE), this.makeHero(TEAM_RED)];
    for (const t of TEAMS) this.recomputeOffers(t);

    // quests: one shuffled list for both teams, so neither side gets an easier run
    const qs = [0, 1, 2, 3];
    for (let i = qs.length - 1; i > 0; i--) { const j = this.rng.quest.int(i + 1); const k = qs[i]; qs[i] = qs[j]; qs[j] = k; }
    this.questList = qs.slice(0, 3);

    this.ai = [null, { decideT: 0, mode: 0 }, { decideT: 0, mode: 0 }];   // mode 0 build, 1 retreat
    this.countTiles();
  }

  // ---------- state: hash, snapshot, restore ----------
  /** Every mutable field, as plain data. Static map data is rebuilt from the seed instead. */
  stateOf() {
    const owner = new Array(NTILES), bld = new Array(NTILES), rubble = new Array(NTILES), chest = new Array(NTILES);
    for (let i = 0; i < NTILES; i++) {
      const t = this.tiles[i];
      owner[i] = t.owner; bld[i] = t.bld; rubble[i] = t.rubble; chest[i] = t.chest;
    }
    const r = this.rng;
    return {
      v: ENGINE_VERSION, config: this.config, tick: this.tick, phase: this.phase, introT: this.introT,
      timeT: this.timeT, lastCount: this.lastCount, lastTick: this.lastTick, alerted: this.alerted,
      chestT: this.chestT, nextId: this.nextId, result: this.result,
      tiles: { owner, bld, rubble, chest },
      heroes: [this.heroes[1], this.heroes[2]], units: this.units, blds: this.blds, projs: this.projs,
      team: [this.team[1], this.team[2]], ai: [this.ai[1], this.ai[2]], quests: this.questList,
      rng: { offer: r.offer.peek(), loot: r.loot.peek(), unit: r.unit.peek(), chest: r.chest.peek(),
        ai1: r.ai1.peek(), ai2: r.ai2.peek(), quest: r.quest.peek() },
    };
  }
  hash() { return hashState(this.stateOf()); }
  /** A deep, JSON-safe copy of the state: survives postMessage, storage and the wire. */
  snapshot() { return JSON.parse(JSON.stringify(this.stateOf())); }
  static restore(snap) {
    if (snap.v !== ENGINE_VERSION) throw new Error('snapshot from engine v' + snap.v + ', this is v' + ENGINE_VERSION);
    const s = JSON.parse(JSON.stringify(snap));
    const e = new Engine(s.config);
    e.tick = s.tick; e.phase = s.phase; e.introT = s.introT; e.timeT = s.timeT; e.lastCount = s.lastCount;
    e.lastTick = s.lastTick; e.alerted = s.alerted; e.chestT = s.chestT; e.nextId = s.nextId; e.result = s.result;
    for (let i = 0; i < NTILES; i++) {
      const t = e.tiles[i];
      t.owner = s.tiles.owner[i]; t.bld = s.tiles.bld[i]; t.rubble = s.tiles.rubble[i]; t.chest = s.tiles.chest[i];
    }
    e.heroes = [null, s.heroes[0], s.heroes[1]];
    e.units = s.units; e.blds = s.blds; e.projs = s.projs;
    e.team = [null, s.team[0], s.team[1]];
    e.ai = [null, s.ai[0], s.ai[1]];
    e.questList = s.quests;
    for (const k of ['offer', 'loot', 'unit', 'chest', 'ai1', 'ai2', 'quest']) e.rng[k] = Prng.resume(s.rng[k]);
    e.ents = new Map();
    for (const t of TEAMS) e.ents.set(e.heroes[t].id, e.heroes[t]);
    for (const u of e.units) e.ents.set(u.id, u);
    for (const b of e.blds) e.ents.set(b.id, b);
    e.events = [];
    return e;
  }

  // ---------- helpers ----------
  emit(type, data) { const ev = data || {}; ev.type = type; this.events.push(ev); }
  tileAt(x, y) {
    const h = worldToHex(x, y);
    return inMap(h.c, h.r) ? this.tiles[idx(h.c, h.r)] : null;
  }
  passable(i) { return i >= 0 && !this.tiles[i].obst; }
  /** The live entity with this id, or null (gone or dead). */
  live(id) {
    if (!id) return null;
    const e = this.ents.get(id);
    if (!e) return null;
    return (e.kind === 'hero' ? !e.dead : e.alive) ? e : null;
  }
  ent(id) { return id ? this.ents.get(id) || null : null; }
  elapsed() { return MATCH_TICKS - this.timeT; }
  radiusOf(e) { return e.kind === 'hero' ? HERO.radius : e.kind === 'bld' ? BLD_RADIUS : UNITS[e.type].size; }
  rngAi(team) { return team === TEAM_BLUE ? this.rng.ai1 : this.rng.ai2; }

  distanceField(start) {
    const d = new Int16Array(NTILES).fill(9999);
    d[start] = 0;
    const q = [start];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (const n of this.tiles[i].nb) if (d[n] === 9999 && !this.tiles[n].obst) { d[n] = d[i] + 1; q.push(n); }
    }
    return d;
  }

  bfsPath(from, to) {
    if (from === to) return [];
    if (!this.passable(to)) return null;
    const prev = new Int16Array(NTILES).fill(-1);
    prev[from] = from;
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (i === to) break;
      for (const n of this.tiles[i].nb) if (prev[n] === -1 && !this.tiles[n].obst) { prev[n] = i; q.push(n); }
    }
    if (prev[to] === -1) return null;
    const path = [];
    for (let i = to; i !== from; i = prev[i]) path.push(i);
    path.reverse();
    return path;
  }

  heroStart(team) {
    const bp = BASE_POS[team];
    const fi = idx(bp.c, bp.r + (team === TEAM_BLUE ? -1 : 1));
    const front = this.tiles[fi];
    return front && !front.obst ? front : this.tiles[baseTile(team)];
  }

  makeHero(team) {
    const st = this.heroStart(team);
    const h = {
      kind: 'hero', team, id: this.nextId++, x: st.x, y: st.y, px: st.x, py: st.y, hp: HERO.hp, maxhp: HERO.hp,
      cd: 0, dead: 0, respT: 0, path: [], kx: 0, ky: 0, tile: st.i, face: team === TEAM_BLUE ? -1 : 1,
      lastHit: -1000, hitT: -1000, aim: 0, moving: 0, regen: 0,
    };
    this.ents.set(h.id, h);
    return h;
  }

  addBuilding(team, type, ti, barracks) {
    const t = this.tiles[ti];
    const def = BUILD[type];
    const b = {
      kind: 'bld', type, team, id: this.nextId++, tile: ti, x: t.x, y: t.y, hp: def.hp, maxhp: def.hp,
      timer: 0, cd: 0, alive: 1, hitT: -1000, bornT: this.tick,
      unit: barracks ? barracks.unit : '', rarity: barracks ? barracks.rarity : -1,
      spawnT: barracks ? ticks(1.5) : 0, kids: 0,
    };
    t.bld = b.id;
    t.rubble = 0;
    t.chest = 0;
    t.owner = team;
    this.blds.push(b);
    this.ents.set(b.id, b);
    return b;
  }

  recomputeOffers(team) {
    const T = this.team[team];
    const cand = new Uint8Array(NTILES);
    for (const b of this.blds) {
      if (b.team !== team || !b.alive) continue;
      for (const n of this.tiles[b.tile].nb) {
        const nt = this.tiles[n];
        if (!nt.obst && !nt.bld) cand[n] = 1;
      }
    }
    for (let i = 0; i < NTILES; i++) {
      if (!cand[i]) T.offers[i] = -1;
      else if (T.offers[i] < 0) T.offers[i] = this.rollOffer();
    }
  }

  rollOffer() {
    let r = this.rng.offer.int(OFFER_W_TOTAL);
    for (let k = 0; k < OFFER_LIST.length; k++) { r -= OFFER_LIST[k].w; if (r < 0) return k; }
    return OF_MINE;
  }
  rollRarity(odds) {
    let r = this.rng.loot.int(100);
    for (let i = 0; i < 4; i++) { r -= odds[i]; if (r < 0) return i; }
    return 0;
  }
  pickUnit(rarity) {
    const list = UNITS_BY_RARITY[rarity];
    return list[this.rng.loot.int(list.length)];
  }

  // ---------- commands ----------
  /** One player command: { owner, goto (tile or -1, one-shot), kx, ky (held, -1..1), ff (forfeit) }.
   *  Everything is validated here: a malformed or hostile command can't break the sim. */
  applyCommand(c) {
    const team = c.owner;
    if (team !== TEAM_BLUE && team !== TEAM_RED) return;
    if (c.ff) { if (this.phase !== PHASE_END) this.endMatch(enemyOf(team), 'forfeit'); return; }
    const h = this.heroes[team];
    h.kx = clampI(c.kx | 0, -1, 1);
    h.ky = clampI(c.ky | 0, -1, 1);
    const g = c.goto | 0;
    if (g >= 0 && g < NTILES) this.setHeroDestination(team, g);
  }

  setHeroDestination(team, ti) {
    const h = this.heroes[team];
    if (h.dead) return false;
    const cur = this.tileAt(h.x, h.y);
    if (!cur) return false;
    const p = this.bfsPath(cur.i, ti);
    if (!p) return false;
    h.path = p.length ? p : [ti];
    return true;
  }

  // ---------- main step ----------
  /** Advance one tick. cmds: this tick's commands (any order; applied by owner). */
  step(cmds) {
    this.events.length = 0;
    for (const t of TEAMS) { const h = this.heroes[t]; h.px = h.x; h.py = h.y; }
    for (const u of this.units) { u.px = u.x; u.py = u.y; }
    for (const p of this.projs) { p.px = p.x; p.py = p.y; }
    if (cmds && cmds.length) {
      for (const owner of TEAMS) for (const c of cmds) if (c.owner === owner) this.applyCommand(c);
    }

    if (this.phase === PHASE_INTRO) {
      this.introT--;
      const c = Math.ceil(this.introT / TICK_RATE);
      if (c < this.lastCount && c >= 1 && c <= 3) { this.lastCount = c; this.emit('count', { n: c }); }
      if (this.introT <= 0) { this.phase = PHASE_PLAY; this.emit('fight'); }
    } else if (this.phase === PHASE_PLAY) {
      this.timeT--;
      if (!this.alerted && this.timeT <= ticks(60)) { this.alerted = 1; this.emit('oneMinute'); }
      const secs = Math.ceil(this.timeT / TICK_RATE);
      if (this.timeT <= ticks(10) && this.timeT > 0 && secs < this.lastTick) { this.lastTick = secs; this.emit('tick', { n: secs }); }

      this.updateEconomy();
      this.updateChests();
      if (this.config.aiRed) this.aiUpdate(TEAM_RED);
      if (this.config.aiBlue) this.aiUpdate(TEAM_BLUE);
      for (const t of TEAMS) this.updateHero(this.heroes[t]);
      this.updateBuildings();
      this.updateUnits();
      this.updateProjectiles();
      this.countTiles();
      this.updateQuests();
      if (this.phase === PHASE_PLAY && this.timeT <= 0) {
        this.timeT = 0;
        const a = this.team[TEAM_BLUE].tiles, b = this.team[TEAM_RED].tiles;
        this.endMatch(a > b ? TEAM_BLUE : b > a ? TEAM_RED : TEAM_NONE, 'time');
      }
    }
    this.tick++;
  }

  endMatch(winner, reason) {
    if (this.phase === PHASE_END) return;
    this.phase = PHASE_END;
    if (reason === 'base') {   // the winner sweeps the map
      for (const t of this.tiles) {
        const b = this.ent(t.bld);
        if (!t.obst && !(b && b.team === winner)) t.owner = winner;
      }
      for (const u of this.units) if (u.team !== winner) u.alive = 0;
      this.units = this.units.filter((u) => u.alive);
    }
    this.countTiles();
    this.result = { winner, reason, blue: this.team[TEAM_BLUE].tiles, red: this.team[TEAM_RED].tiles, tick: this.tick };
    this.emit('end', { winner, reason, blue: this.result.blue, red: this.result.red });
  }

  countTiles() {
    let a = 0, b = 0;
    for (const t of this.tiles) { if (t.owner === TEAM_BLUE) a++; else if (t.owner === TEAM_RED) b++; }
    this.team[TEAM_BLUE].tiles = a; this.team[TEAM_RED].tiles = b;
    let ua = 0, ub = 0;
    for (const u of this.units) if (u.alive) { if (u.team === TEAM_BLUE) ua++; else ub++; }
    this.team[TEAM_BLUE].units = ua; this.team[TEAM_RED].units = ub;
  }

  questOf(team) {
    const T = this.team[team];
    if (T.questIdx >= this.questList.length) return null;
    const q = QUESTS[this.questList[T.questIdx]];
    const prog = q.kind === 'tiles' ? T.tiles : T.built[q.kind];
    return { q, prog: Math.min(prog, q.need) };
  }
  updateQuests() {
    for (const team of TEAMS) {
      const qp = this.questOf(team);
      if (!qp || qp.prog < qp.q.need) continue;
      const T = this.team[team];
      T.gold += qp.q.reward;
      T.questIdx++;
      T.questT = this.tick;
      const h = this.heroes[team];
      this.emit('quest', { team, reward: qp.q.reward, x: h.x, y: h.y });
    }
  }

  // ---------- economy ----------
  updateEconomy() {
    for (const b of this.blds) {
      const def = BUILD[b.type];
      if (!def.income) continue;
      if (++b.timer >= def.incomeEvery) {
        b.timer = 0;
        this.team[b.team].gold += def.income;
        this.emit('income', { team: b.team, kind: b.type, amount: def.income, x: b.x, y: b.y });
      }
    }
  }

  updateChests() {
    if (--this.chestT > 0) return;
    this.chestT = CHEST.every;
    const rng = this.rng.chest;
    for (let tries = 0; tries < 40; tries++) {
      const r = 6 + rng.int(3);   // rows 6..8, mirrored to 10..12
      const c = rng.int(COLS);
      const a = this.tiles[idx(c, r)], b = this.tiles[idx(c, ROWS - 1 - r)];
      if (a.obst || b.obst || a.bld || b.bld || a.chest || b.chest) continue;
      a.chest = b.chest = 1;
      this.emit('chestSpawn', { a: a.i, b: b.i });
      break;
    }
  }

  tryBuy(team, ti) {
    const T = this.team[team];
    const oi = T.offers[ti];
    if (oi < 0) return false;
    const tile = this.tiles[ti];
    if (tile.bld || tile.obst) return false;
    const off = OFFER_LIST[oi];
    if (T.gold < off.cost) { this.emit('needGold', { team, x: tile.x, y: tile.y }); return false; }
    T.gold -= off.cost;
    T.built[off.kind]++;
    if (off.kind === 'mystery') {
      T.offers[ti] = this.rollOffer();
      tile.owner = team;
      let r = this.rng.loot.int(100), roll = 0;
      while (roll < 3 && r >= MYSTERY_ODDS[roll]) { r -= MYSTERY_ODDS[roll]; roll++; }
      if (roll === 0) {
        this.emit('mysteryNothing', { team, x: tile.x, y: tile.y });
      } else {
        const rarity = roll === 1 ? 0 : roll === 2 ? 2 : 3;
        const type = this.pickUnit(rarity);
        const n = rarity === 0 ? 3 : 1;
        for (let k = 0; k < n; k++) this.spawnUnit(team, type, tile.x + (k - 1) * 400, tile.y + 200, 0);
        this.emit('mysteryWin', { team, x: tile.x, y: tile.y, unit: type, rarity });
      }
      this.emit('burst', { x: tile.x, y: tile.y, color: '#fde047', n: 14 });
      return true;
    }
    if (off.kind === 'barracks') {
      const rarity = this.rollRarity(off.odds);
      const unit = this.pickUnit(rarity);
      this.addBuilding(team, 'barracks', ti, { unit, rarity });
      this.emit('barracks', { team, unit, rarity, x: tile.x, y: tile.y });
    } else {
      this.addBuilding(team, off.kind, ti, null);
      this.emit('built', { team, kind: off.kind, x: tile.x, y: tile.y });
    }
    this.emit('burst', { x: tile.x, y: tile.y, color: team === TEAM_BLUE ? '#93c5fd' : '#fca5a5', n: 12 });
    this.recomputeOffers(TEAM_BLUE);
    this.recomputeOffers(TEAM_RED);
    return true;
  }

  // ---------- units ----------
  spawnUnit(team, type, x, y, barId) {
    const def = UNITS[type];
    const t = this.tileAt(x, y);
    const u = {
      kind: 'unit', type, team, id: this.nextId++, x, y, px: x, py: y, hp: def.hp, maxhp: def.hp,
      cd: Math.trunc(def.rate / 2), alive: 1, tgt: 0, retT: 0, step: -1, tile: t ? t.i : -1, bar: barId,
      hitT: -1000, lungeT: -1000, face: team === TEAM_BLUE ? 1 : -1, lane: this.rng.unit.int(1000), bornT: this.tick,
    };
    this.units.push(u);
    this.ents.set(u.id, u);
    if (barId) { const b = this.ent(barId); if (b) b.kids++; }
    this.emit('spawn', { team, x, y, unit: type });
    return u;
  }

  enemiesOf(team) {
    const out = [];
    const h = this.heroes[enemyOf(team)];
    if (!h.dead) out.push(h);
    for (const u of this.units) if (u.alive && u.team !== team) out.push(u);
    return out;
  }

  nearestEnemyMobile(team, x, y, maxDist) {
    let best = null, bd = maxDist * maxDist;
    const h = this.heroes[enemyOf(team)];
    if (!h.dead) {
      const d = dist2(h.x - x, h.y - y);
      if (d < bd) { bd = d; best = h; }
    }
    for (const u of this.units) {
      if (!u.alive || u.team === team) continue;
      const d = dist2(u.x - x, u.y - y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  nearestEnemyBuilding(team, x, y, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const b of this.blds) {
      if (!b.alive || b.team === team) continue;
      const d = dist2(b.x - x, b.y - y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** Move e toward (tx, ty) by at most `step`; true when it arrived. */
  moveToward(e, tx, ty, step) {
    const dx = tx - e.x, dy = ty - e.y;
    const d = dist(dx, dy);
    if (d <= step || d < 1) { e.x = tx; e.y = ty; return true; }
    e.x += muldiv(dx, step, d);
    e.y += muldiv(dy, step, d);
    if (Math.abs(dx) > 50) e.face = dx > 0 ? 1 : -1;
    return false;
  }

  // ---------- combat ----------
  fire(src, target, dmg, kind, speed, splash, bldMult) {
    this.projs.push({
      x: src.x, y: src.y - PROJ.launchDy, px: src.x, py: src.y - PROJ.launchDy, tgt: target.id, team: src.team,
      dmg, kind, speed, splash, bm: bldMult, tx: target.x, ty: target.y - PROJ.aimDy, life: PROJ.life,
    });
  }

  damage(target, amount, srcTeam, bldMult) {
    if (target.kind === 'bld') amount *= bldMult;
    if (target.kind === 'hero' ? target.dead : !target.alive) return;
    target.hp -= amount;
    target.hitT = this.tick;
    if (target.kind !== 'unit') this.emit('dmg', { id: target.id, team: target.team, x: target.x, y: target.y, amount });
    if (target.kind === 'hero') target.lastHit = this.tick;
    if (target.hp <= 0) this.kill(target, srcTeam);
  }

  kill(e, srcTeam) {
    if (e.kind === 'hero') {
      e.dead = 1; e.hp = 0; e.respT = HERO.respawn; e.path = []; e.aim = 0; e.regen = 0;
      this.emit('burst', { x: e.x, y: e.y, color: '#ffffff', n: 16 });
      this.emit('heroDown', { team: e.team, x: e.x, y: e.y });
    } else if (e.kind === 'unit') {
      e.alive = 0;
      if (e.bar) { const b = this.ent(e.bar); if (b) b.kids--; }
      this.emit('burst', { x: e.x, y: e.y, color: e.team === TEAM_BLUE ? '#60a5fa' : '#f87171', n: 8 });
      this.emit('unitDown', { team: e.team, x: e.x, y: e.y });
    } else {
      e.alive = 0;
      const t = this.tiles[e.tile];
      t.bld = 0;
      t.rubble = 1;
      t.owner = srcTeam;
      this.blds.splice(this.blds.indexOf(e), 1);
      this.ents.delete(e.id);
      this.emit('burst', { x: e.x, y: e.y, color: '#a8a29e', n: 22 });
      this.emit('bldDown', { team: e.team, x: e.x, y: e.y, kind: e.type });
      if (e.type === 'base') { this.endMatch(srcTeam, 'base'); return; }
      this.recomputeOffers(TEAM_BLUE);
      this.recomputeOffers(TEAM_RED);
    }
  }

  // ---------- hero ----------
  /** Movement only: the part a render-side predictor may replay (no captures, no combat). */
  moveHero(h) {
    let moving = 0;
    if (h.kx || h.ky) {
      h.path.length = 0;
      const s = h.kx && h.ky ? muldiv(HERO.speed, 707, 1000) : HERO.speed;
      const vx = h.kx * s, vy = h.ky * s;
      if (!this.tryStep(h, h.x + vx, h.y + vy)) { if (!this.tryStep(h, h.x + vx, h.y)) this.tryStep(h, h.x, h.y + vy); }
      if (vx) h.face = vx > 0 ? 1 : -1;
      moving = 1;
    } else if (h.path.length) {
      const t = this.tiles[h.path[0]];
      if (this.moveToward(h, t.x, t.y, HERO.speed)) h.path.shift();
      moving = 1;
    }
    h.moving = moving;
  }
  tryStep(e, nx, ny) {
    const t = this.tileAt(nx, ny);
    if (!t || t.obst) return false;
    e.x = nx; e.y = ny;
    return true;
  }

  updateHero(h) {
    if (h.dead) {
      if (--h.respT <= 0) {
        const st = this.heroStart(h.team);
        h.x = h.px = st.x; h.y = h.py = st.y; h.hp = h.maxhp; h.dead = 0; h.path = []; h.tile = st.i; h.cd = ticks(0.5);
        this.emit('respawn', { team: h.team, x: h.x, y: h.y });
      }
      return;
    }
    this.moveHero(h);
    const t = this.tileAt(h.x, h.y);
    if (t && t.i !== h.tile) { h.tile = t.i; this.onHeroEnter(h, t); }
    // regen: fast at home, slow after a few quiet seconds; an integer accumulator keeps fractions
    const home = this.tiles[baseTile(h.team)];
    const nearHome = dist2(home.x - h.x, home.y - h.y) < HERO.homeRadius * HERO.homeRadius;
    const rate = nearHome ? HERO.regenHome : (this.tick - h.lastHit > HERO.idleAfter ? HERO.regenIdle : 0);
    if (h.hp < h.maxhp && rate) {
      h.regen += rate;
      h.hp = Math.min(h.maxhp, h.hp + Math.trunc(h.regen / TICK_RATE));
      h.regen %= TICK_RATE;
    } else h.regen = 0;
    // attack
    if (h.cd > 0) h.cd--;
    const target = this.nearestEnemyMobile(h.team, h.x, h.y, HERO.range) || this.nearestEnemyBuilding(h.team, h.x, h.y, HERO.range);
    h.aim = target ? target.id : 0;
    if (target && h.cd <= 0) {
      h.cd = HERO.rate;
      this.fire(h, target, HERO.dmg, 'bolt', PROJ.bolt, 0, 1);
      this.emit('shoot', { team: h.team });
    }
  }

  onHeroEnter(h, t) {
    if (t.obst) return;
    const b = this.ent(t.bld);
    if (!(b && b.team !== h.team)) t.owner = h.team;
    if (t.chest) {
      t.chest = 0;
      this.team[h.team].gold += CHEST.gold;
      this.emit('chest', { team: h.team, gold: CHEST.gold, x: t.x, y: t.y });
      this.emit('burst', { x: t.x, y: t.y, color: '#fde047', n: 10 });
    }
    if (!t.bld && this.team[h.team].offers[t.i] >= 0) this.tryBuy(h.team, t.i);
  }

  // ---------- buildings ----------
  updateBuildings() {
    for (const b of this.blds) {
      const def = BUILD[b.type];
      if (def.dmg) {
        if (b.cd > 0) b.cd--;
        if (b.cd <= 0) {
          const target = this.nearestEnemyMobile(b.team, b.x, b.y, def.range);
          if (target) { b.cd = def.rate; this.fire(b, target, def.dmg, 'tower', PROJ.tower, 0, 1); }
        }
      }
      if (b.type === 'barracks') {
        const ud = UNITS[b.unit];
        if (b.kids < ud.cap) {
          if (--b.spawnT <= 0) {
            b.spawnT = ud.spawn;
            this.spawnUnit(b.team, b.unit, b.x + this.rng.unit.range(-250, 250), b.y + 300, b.id);
          }
        } else b.spawnT = Math.max(b.spawnT, TICK_RATE);
      }
    }
  }

  // ---------- units ----------
  updateUnits() {
    const us = this.units;
    for (const u of us) {
      if (!u.alive) continue;
      const def = UNITS[u.type];
      if (u.cd > 0) u.cd--;
      if (--u.retT <= 0) {
        u.retT = 9 + this.rng.unit.int(4);
        const t = this.nearestEnemyMobile(u.team, u.x, u.y, def.aggroMobile) ||
          this.nearestEnemyBuilding(u.team, u.x, u.y, def.aggroBuilding);
        u.tgt = t ? t.id : 0;
        u.step = -1;
      }
      const tg = this.live(u.tgt);
      if (u.tgt && !tg) { u.tgt = 0; u.retT = 0; }
      if (tg) {
        const d = dist(tg.x - u.x, tg.y - u.y);
        const reach = def.range + Math.trunc(this.radiusOf(tg) / 2);
        if (d <= reach) {
          if (u.cd <= 0) {
            u.cd = def.rate;
            if (def.ranged) this.fire(u, tg, def.dmg, def.ranged, PROJ.unit, def.splash, def.bldMult);
            else {
              this.damage(tg, def.dmg, u.team, def.bldMult);
              u.lungeT = this.tick;
              this.emit('melee', { team: u.team, x: tg.x, y: tg.y });
            }
          }
          if (Math.abs(tg.x - u.x) > 50) u.face = tg.x > u.x ? 1 : -1;
        } else this.unitStepToward(u, tg, def.speed);
      } else this.unitMarch(u, def.speed);
    }
    this.separate();
    // tile capture
    for (const u of this.units) {
      if (!u.alive) continue;
      const t = this.tileAt(u.x, u.y);
      if (t && t.i !== u.tile) {
        u.tile = t.i;
        const b = this.ent(t.bld);
        if (!t.obst && !(b && b.team !== u.team)) t.owner = u.team;
      }
    }
    let dead = 0;
    for (const u of this.units) if (!u.alive) { dead++; this.ents.delete(u.id); }
    if (dead) this.units = this.units.filter((u) => u.alive);
  }

  /** Push overlapping units apart through a uniform grid (after Potion Siege's spatial hash):
   *  each unit only meets its own and the 8 surrounding cells. Pairs run in index order. */
  separate() {
    const us = this.units;
    let maxR = 0;
    for (const u of us) if (u.alive && UNITS[u.type].size > maxR) maxR = UNITS[u.type].size;
    const cell = Math.max(200, muldiv(maxR, 18, 10));
    const grid = new Map();
    for (let i = 0; i < us.length; i++) {
      const u = us[i]; if (!u.alive) continue;
      const key = Math.floor(u.x / cell) * 4096 + Math.floor(u.y / cell);
      let list = grid.get(key);
      if (!list) { list = []; grid.set(key, list); }
      list.push(i);
    }
    for (let i = 0; i < us.length; i++) {
      const a = us[i]; if (!a.alive) continue;
      const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const list = grid.get((cx + ox) * 4096 + cy + oy);
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const j = list[k];
          if (j <= i) continue;
          const b = us[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const min = muldiv(UNITS[a.type].size + UNITS[b.type].size, 9, 10);
          const d2 = dx * dx + dy * dy;
          if (d2 < min * min && d2 > 100) {
            const d = isqrt(d2), push = Math.trunc((min - d) / 2);
            if (push <= 0) continue;
            const nx = muldiv(dx, push, d), ny = muldiv(dy, push, d);
            this.nudge(a, -nx, -ny);
            this.nudge(b, nx, ny);
          }
        }
      }
    }
  }

  nudge(e, dx, dy) {
    const t = this.tileAt(e.x + dx, e.y + dy);
    if (t && !t.obst) { e.x += dx; e.y += dy; }
  }

  unitStepToward(u, tg, speed) {
    const cur = this.tileAt(u.x, u.y);
    const tt = this.tileAt(tg.x, tg.y);
    if (!cur || !tt || cur.i === tt.i || cur.nb.includes(tt.i)) { this.moveToward(u, tg.x, tg.y, speed); return; }
    if (u.step < 0 || u.step === cur.i) {
      const p = this.bfsPath(cur.i, tt.i);
      u.step = p && p.length ? p[0] : -1;
    }
    if (u.step >= 0) {
      const s = this.tiles[u.step];
      if (this.moveToward(u, s.x, s.y, speed)) u.step = -1;
    } else this.moveToward(u, tg.x, tg.y, speed);
  }

  unitMarch(u, speed) {
    const field = this.flow[enemyOf(u.team)];
    const cur = this.tileAt(u.x, u.y);
    if (!cur) return;
    if (u.step < 0 || u.step === cur.i) {
      const best = [];
      let bd = field[cur.i];
      for (const n of cur.nb) {
        if (this.tiles[n].obst) continue;
        if (field[n] < bd) { bd = field[n]; best.length = 0; best.push(n); }
        else if (field[n] === bd && best.length) best.push(n);
      }
      if (!best.length) { u.step = -1; return; }
      u.step = best[Math.trunc(u.lane * best.length / 1000) % best.length];
    }
    const s = this.tiles[u.step];
    const off = muldiv(u.lane - 500, 6, 10);   // aim a bit off-centre per unit so groups spread
    if (this.moveToward(u, s.x + off, s.y, speed)) u.step = -1;
    else {
      const here = this.tileAt(u.x, u.y);
      if (here && here.i === u.step) u.step = -1;
    }
  }

  // ---------- projectiles ----------
  updateProjectiles() {
    for (const p of this.projs) {
      p.life--;
      const tg = this.live(p.tgt);
      if (tg) { p.tx = tg.x; p.ty = tg.y - PROJ.aimDy; }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = dist(dx, dy);
      if (d <= p.speed) {
        p.life = 0;
        p.x = p.tx; p.y = p.ty;
        if (tg) this.damage(tg, p.dmg, p.team, p.bm);
        if (p.splash) {
          const r2 = p.splash * p.splash;
          for (const e of this.enemiesOf(p.team)) {
            if (e === tg) continue;
            if (dist2(e.x - p.tx, e.y - p.ty) < r2) this.damage(e, Math.trunc(p.dmg / 2), p.team, 1);
          }
          this.emit('ring', { x: p.tx, y: p.ty, r: p.splash, kind: p.kind });
        }
        this.emit('hit', { team: p.team, victim: tg ? tg.team : 0 });
      } else {
        p.x += muldiv(dx, p.speed, d);
        p.y += muldiv(dy, p.speed, d);
      }
    }
    let gone = 0;
    for (const p of this.projs) if (p.life <= 0) gone++;
    if (gone) this.projs = this.projs.filter((p) => p.life > 0);
  }

  // ---------- AI (drives a team when config says so; deterministic, own Prng stream) ----------
  aiUpdate(team) {
    const foe = enemyOf(team);
    const fwd = (r) => (team === TEAM_RED ? r : ROWS - 1 - r);
    const h = this.heroes[team];
    const T = this.team[team];
    if (h.dead) return;
    const ai = this.ai[team];
    const rng = this.rngAi(team);
    ai.decideT--;
    if (ai.decideT > 0 && h.path.length) return;
    ai.decideT = 18 + rng.int(13);

    const cur = this.tileAt(h.x, h.y);
    if (!cur) return;
    const homeI = baseTile(team);

    if (h.hp * 100 < h.maxhp * 35) ai.mode = 1;
    if (ai.mode === 1) {
      if (h.hp * 100 > h.maxhp * 80) ai.mode = 0;
      else {
        let spot = homeI;
        for (const n of this.tiles[homeI].nb) if (!this.tiles[n].obst) { spot = n; break; }
        if (cur.i !== spot) this.setHeroDestination(team, spot);
        return;
      }
    }

    const dist = this.distanceField(cur.i);
    let mines = 0, barracks = 0;
    for (const b of this.blds) if (b.team === team) { if (b.type === 'mine') mines++; else if (b.type === 'barracks') barracks++; }
    const el = this.elapsed();

    let threat = 0;
    for (const u of this.units) if (u.alive && u.team !== team && u.tile >= 0 && this.flow[team][u.tile] <= 4) threat++;

    // best affordable offer by value / distance (value x10, score x1000, all integer)
    let best = -1, bestScore = 0;
    for (let ti = 0; ti < NTILES; ti++) {
      const oi = T.offers[ti];
      if (oi < 0) continue;
      const d = dist[ti];
      if (d >= 9999) continue;
      // gold + income * travel time < cost  ->  skip (income 10/3 + 2.5/mine per s, hero 2.8 tiles/s)
      if (T.gold * 336 + (40 + 30 * mines) * d * 10 < OFFER_LIST[oi].cost * 336) continue;
      let v;
      switch (oi) {
        case OF_MINE: v = mines >= 6 ? 20 : el < ticks(90) ? 90 : 40; break;
        case OF_TOWER: v = 20 + 20 * threat; break;
        case OF_BAR1: v = barracks < 3 ? 70 : 40; break;
        case OF_BAR2: v = 80; break;
        case OF_BAR3: v = 120; break;
        default: v = 25;
      }
      const score = Math.trunc(v * (100 + 3 * fwd(this.tiles[ti].r)) * 2 / (2 * d + 3));
      if (score > bestScore) { bestScore = score; best = ti; }
    }
    if (best >= 0 && bestScore > 600 && best !== cur.i) { this.setHeroDestination(team, best); return; }

    // otherwise claim territory: near, unowned, forward late in the match, chests first (x20)
    let goal = -1, gScore = -1000000000;
    for (let k = 0; k < 40; k++) {
      const t = this.tiles[rng.int(NTILES)];
      if (t.obst || t.owner === team || dist[t.i] >= 9999) continue;
      const b = this.ent(t.bld);
      if (b && b.team !== team && b.type !== 'base' && h.hp * 10 < h.maxhp * 6) continue;
      let s = -24 * dist[t.i] + (t.owner === foe ? 40 : 0) + (el > ticks(110) ? 5 * fwd(t.r) : 0);
      if (this.flow[foe][t.i] < 3 && el < ticks(150)) s -= 120;   // keep off the enemy castle early
      if (t.chest) s += 160;
      if (s > gScore) { gScore = s; goal = t.i; }
    }
    if (goal >= 0) this.setHeroDestination(team, goal);
  }
}
