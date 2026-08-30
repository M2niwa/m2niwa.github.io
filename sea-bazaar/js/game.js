/* ============================================================
   战斗模拟核心：舰船物理（含水面阻力）、热量系统、
   武器/弹道、光束、鱼雷拦截、AI（人类反应速度）、特效
   ============================================================ */
(function () {
  'use strict';

  const U = Util, D = Data;
  const DEG = Math.PI / 180;
  const AUDIO = (typeof AudioFx !== 'undefined') ? AudioFx : null;
  function snd(name) {
    if (AUDIO && AUDIO[name]) AUDIO[name].apply(AUDIO, Array.prototype.slice.call(arguments, 1));
  }

  function approachAngle(cur, target, maxDelta) {
    return cur + U.clamp(U.angleDiff(target, cur), -maxDelta, maxDelta);
  }

  /* ============================================================
     AI 性格（参考远行星号：鲁莽/激进/稳健/谨慎/怯懦）
     友军比敌军同级舰更积极主动
     ============================================================ */
  const PERSONAS = {
    reckless: { fleeHull: 0.12, band: 0.85, kite: false, backMargin: 110 },
    aggressive: { fleeHull: 0.2, band: 0.95, kite: false, backMargin: 140 },
    steady: { fleeHull: 0.28, band: 1.05, kite: true, backMargin: 180 },
    cautious: { fleeHull: 0.38, band: 1.2, kite: true, backMargin: 240 },
    timid: { fleeHull: 0.5, band: 1.35, kite: true, backMargin: 320 }
  };
  const ENEMY_PERSONA = { dd_gun: 'steady', dd_torp: 'aggressive', cl_std: 'steady', cl_beam: 'steady', ca_std: 'steady', bb_std: 'aggressive' };
  const ALLY_PERSONA = { dd_gun: 'aggressive', dd_torp: 'reckless', cl_std: 'aggressive', cl_beam: 'aggressive', ca_std: 'steady', bb_std: 'steady' };

  // 损管护盾：开启时把伤害折算为热量（×系数，默认 1.0），另有部分成为「硬损伤」永久占用热量
  const SHIELD_HEAT = 0.42;   // 每点被护盾吸收的伤害 → 热量
  const SHIELD_HARD = 0.28;   // 每点被护盾吸收的伤害 → 硬损伤占用（护盾开启时不可恢复）
  const SHIELD_UPKEEP = 0.03; // 护盾维持：开启时每秒消耗 热容×此比例（持续开盾有明显耗热成本, 进软热量）

  // 伤害类型：高爆/动能/破片/光束 —— 对盾/对甲倍率（远行星号式）
  // 动能克盾（2×）、高爆克甲（2×）、破片只克裸船体、光束全能
  const SHIELD_MULT = { he: 0.5, kin: 2, frag: 0.25, beam: 1 };
  const ARMOR_MULT = { he: 2, kin: 0.5, frag: 0.25, beam: 1 };
  const DTYPE_OF = { gun: 'kin', beam: 'beam', bolt: 'beam', torpedo: 'he', missile: 'he' };

  // 弹道规避参数（远行星号 CollisionAnalysisModule 风格）：
  // 对每枚来袭弹体预演轨迹，按「最近点距离 < 本舰半径+余量」且「预计进入危险圈时间 < 反应上限」判定威胁
  const EVADE_SCAN_R = 620;   // 扫描半径：只评估范围内的来袭弹体
  const EVADE_SIM_T = 2.6;    // 轨迹预演时长（秒）
  const EVADE_SIM_DT = 0.1;   // 预演步长（秒）
  const EVADE_REACT = { gun: 0.55, bolt: 0.5, torpedo: 2.6, missile: 1.5 }; // 反应上限（秒）：预计命中时间超过则来不及/不值得躲
  const EVADE_MARGIN = { gun: 12, bolt: 16, torpedo: 42, missile: 28 };     // 危险半径余量（叠加本舰半径）

  function makeAi(skill, persona, opts) {
    opts = opts || {};
    return {
      skill: skill,
      persona: persona || 'steady',
      p: PERSONAS[persona] || PERSONAS.steady,
      escort: !!opts.escort,
      target: null,
      switchT: 0,
      timer: 0,
      state: 'approach',
      side: Math.random() < 0.5 ? -1 : 1,
      desiredHeading: 0,
      throttle: 0,
      evadeT: 0,
      evadeDir: 0,
      threatT: 0.2,
      ventT: 0,
      profile: null,
      torpAlignT: 0
    };
  }

  /** 装配画像：按 DPS 加权得出交战距离偏好 */
  function computeRangeProfile(ship) {
    let weighted = 0, weight = 0, maxR = 0;
    for (const w of ship.weapons) {
      maxR = Math.max(maxR, w.range);
      let dps;
      if (w.def.kind === 'beam') dps = w.def.dmg;
      else dps = (w.def.dmg * (w.def.burst || 1)) / Math.max(0.3, w.def.refire);
      weighted += dps * w.range;
      weight += dps;
    }
    return {
      maxR,
      preferred: weight > 0 ? (weighted / weight) * 0.78 : maxR * 0.7
    };
  }

  /** 破防判定：最大单发有效伤害（按伤害类型 ×对盾/对甲倍率）是否足以击穿目标
      （远行星号式目标筛选：目标开盾时按对盾倍率评估，否则按对甲倍率） */
  function canPenetrate(ship, t) {
    let maxHit = 0;
    const dmgM = ship.dmgMult || 1;
    const vsShield = !!(t.shield && t.shield.on && !t.overloaded());
    for (const w of ship.weapons) {
      if (w.def.ammo !== undefined && w.ammo <= 0) continue;
      const dt = w.def.dtype || DTYPE_OF[w.def.kind] || 'kin';
      const m = (vsShield ? SHIELD_MULT : ARMOR_MULT)[dt] || 1;
      if (w.def.kind === 'beam') maxHit = Math.max(maxHit, w.def.dmg * 0.3 * dmgM * m);
      else maxHit = Math.max(maxHit, w.def.dmg * dmgM * m);
    }
    return maxHit >= t.armor * 0.85;
  }

  /** 待发射的鱼雷管：有备弹、冷却完成、目标在射程内、且目标吃水足够（深水鱼雷打不了小艇） */
  function readyTorpedo(ship, t) {
    const d = U.dist(ship.x, ship.y, t.x, t.y);
    let best = null;
    for (const w of ship.weapons) {
      if (w.def.mount !== 'missile' || w.def.ammo === undefined) continue;
      if (w.ammo <= 0 || w.cooldown > 0) continue;
      if ((w.def.depth || 1) > (t.draft || 1)) continue; // 深水鱼雷：目标吃水不足
      if (d > w.range * 0.92) continue;
      if (!best || w.ammo > best.ammo) best = w;
    }
    return best;
  }

  /** 舷侧选择：选出能把更多武器射界覆盖到目标的一侧 */
  function bestBroadside(ship, bearing) {
    let cL = 0, cR = 0;
    for (const w of ship.weapons) {
      if (w.slot.type === 'fixed') continue;
      const half = w.slot.arc * DEG / 2 + 0.18;
      const off = w.slot.center * DEG;
      // side=-1: rel = 1.15 - off;  side=+1: rel = -1.15 - off
      if (Math.abs(U.normAngle(1.15 - off)) <= half) cL++;
      if (Math.abs(U.normAngle(-1.15 - off)) <= half) cR++;
    }
    if (cL === cR) return 0;
    return cL > cR ? -1 : 1;
  }

  /* ============================================================
     武器实例
     ============================================================ */
  class WeaponInst {
    constructor(slot, def, ship, game) {
      this.slot = slot; this.def = def; this.ship = ship; this.game = game;
      this.cooldown = 0;
      this.ammo = def.ammo ? Math.max(1, Math.round(def.ammo * ship.ammoMult)) : Infinity;
      this.ammoMax = this.ammo;
      this.angle = ship.heading + slot.center * DEG;
      this.groupIdx = 0;
      this.burstLeft = 0; this.burstTimer = 0; this.burstAim = 0;
      this.beamOn = false; this.beamT = 0; this.beamHit = 0; this.beamSndT = 0;
      this.acquire = 0;
      this.flash = 0;
      this.targetAngle = this.angle;
      this.trackAim = false;
      this.range = def.range * ship.rangeMult;
      // 炮塔旋转速度（度/秒）：小口径快、大口径慢；光束较快、导弹发射架适中
      let deg = slot.size === 'large' ? 60 : (slot.size === 'medium' ? 90 : 130);
      if (def.kind === 'beam') deg *= 1.25;
      if (slot.type === 'missile') deg = 85;
      this.turnRate = deg * DEG;
      this.fireTol = 3.5 * DEG; // 对准容差（固定炮管无限制）
    }
    ready() { return this.cooldown <= 0 && this.ammo > 0 && this.burstLeft === 0; }
    heatPerShot() { return this.def.heat || 0; }
    heatPerSec() { return this.def.heatPS || 0; }
    muzzleOff() { return this.slot.size === 'large' ? 19 : (this.slot.size === 'medium' ? 13 : 9); }
    worldPos() {
      const s = this.ship, f = U.dirOf(s.heading), r = { x: f.y, y: -f.x };
      return {
        x: s.x + f.x * this.slot.y + r.x * this.slot.x,
        y: s.y + f.y * this.slot.y + r.y * this.slot.x
      };
    }
    worldCenterAngle() { return this.ship.heading + this.slot.center * DEG; }
    /** 是否已对准目标方向（固定炮管始终对准船艏） */
    aligned(aimA) {
      if (this.slot.type === 'fixed') return true;
      return Math.abs(U.angleDiff(this.angle, aimA)) <= this.fireTol;
    }
    /** 命令炮塔追踪目标方向（以自身转速转动） */
    aimAt(aimA) {
      if (this.slot.type === 'fixed') return;
      this.targetAngle = aimA;
      this.trackAim = true;
    }

    update(dt, game) {
      if (this.cooldown > 0) this.cooldown -= dt;
      if (this.flash > 0) this.flash -= dt;
      // 连发
      if (this.burstLeft > 0) {
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
          this.burstLeft--;
          game.fireShot(this, this.burstAim + U.gauss(0.012));
          if (this.burstLeft > 0) this.burstTimer = this.def.burstInterval;
        }
      }
      // 光束：持续照射
      if (this.beamOn && this.def.kind === 'beam') {
        this.beamT += dt;
        const ship = this.ship;
        ship.heatSoft = Math.min(ship.heatCap * 0.92, ship.heatSoft + this.heatPerSec() * dt);
        ship.recalcHeat();
        if (ship.heat >= ship.heatCap * 0.92 || ship.vent.active || ship.vent.lock > 0 || ship.overloaded()) {
          this.beamOn = false;
        }
        while (this.beamT >= 0.1) {
          this.beamT -= 0.1;
          game.beamTick(this);
        }
        this.beamSndT -= dt;
        if (this.beamSndT <= 0) { this.beamSndT = 0.45; snd('zap'); }
      }
      // 炮塔以自身转速追踪目标方向
      if (this.trackAim && this.slot.type !== 'fixed') {
        this.angle = approachAngle(this.angle, this.targetAngle, this.turnRate * dt);
      }
      // 空闲炮塔随船体回正
      if (this.slot.type !== 'fixed' && !this.trackAim && !this.beamOn && this.flash <= 0) {
        this.angle = approachAngle(this.angle, this.worldCenterAngle(), this.turnRate * 0.35 * dt);
      }
    }
  }

  /* ============================================================
     弹丸
     ============================================================ */
  class Projectile {
    constructor(opts) {
      this.kind = opts.kind;
      this.x = opts.x; this.y = opts.y;
      this.angle = opts.angle;
      this.speed = opts.speed;
      this.vx = Math.sin(opts.angle) * opts.speed;
      this.vy = -Math.cos(opts.angle) * opts.speed;
      this.dmg = opts.dmg;
      this.dtype = opts.dtype || DTYPE_OF[opts.kind] || 'kin';
      this.team = opts.team;
      this.hp = opts.hp || 0;
      this.def = opts.def;
      this.owner = opts.owner || null;
      this.target = opts.target || null;
      this.turn = opts.turn || 0;
      this.r = opts.r || 3;
      this.maxLife = opts.maxLife || 6;
      this.life = 0;
      this.dead = false;
      this.wakeT = 0;
      this.warned = false;
      this.flicker = Math.random() * 10;
    }
    update(dt, game) {
      this.life += dt;
      if (this.life >= this.maxLife) {
        this.dead = true;
        if (this.kind === 'torpedo' || this.kind === 'missile') {
          game.addSplash(this.x, this.y, 0.7);
        }
        return;
      }
      // 导弹制导
      if (this.kind === 'missile' && this.target && this.target.alive) {
        const ta = U.angleOf(this.target.x - this.x, this.target.y - this.y);
        this.angle = approachAngle(this.angle, ta, this.turn * DEG * dt);
        const sp = Math.hypot(this.vx, this.vy);
        this.vx = Math.sin(this.angle) * sp;
        this.vy = -Math.cos(this.angle) * sp;
      } else if (this.kind === 'missile' && this.target && !this.target.alive) {
        this.target = null;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      // 鱼雷尾迹
      if (this.kind === 'torpedo') {
        this.wakeT -= dt;
        if (this.wakeT <= 0) {
          this.wakeT = 0.05;
          game.addWakePoint(this.x, this.y, this.angle, 0.5);
        }
      }
      // 导弹: 无水面尾迹, 拖一缕烟(尾焰已在弹体绘制)
      if (this.kind === 'missile') {
        this.wakeT -= dt;
        if (this.wakeT <= 0) {
          this.wakeT = 0.07;
          game.addEffect(new Effect({ type: 'smoke', x: this.x, y: this.y, vx: U.rand(-6,6), vy: U.rand(-6,6), maxLife: 0.5, size: 1.2, color: '#aab0b8' }));
        }
      }
      // 鱼雷来袭警报
      if (this.kind === 'torpedo' && this.team === 'enemy' && !this.warned) {
        const pl = game.player;
        if (pl && pl.alive && U.dist(this.x, this.y, pl.x, pl.y) < 430) {
          this.warned = true;
          game.torpedoWarn();
        }
      }
      // 出界
      if (this.x < -100 || this.x > game.worldW + 100 || this.y < -100 || this.y > game.worldH + 100) {
        this.dead = true;
      }
    }
  }

  /* ============================================================
     载机（战斗机/轰炸机）：以小队行动，无舰船碰撞体积，
     会被弹丸/光束/爆炸命中；由母舰整备系统管理
     ============================================================ */
  class Fighter {
    constructor(opts) {
      this.def = opts.def;
      this.team = opts.team;
      this.carrier = opts.carrier; // 母舰
      this.bay = opts.bay;         // 所属机库
      this.idx = opts.idx;         // 小队内序号（编队展开用）
      this.x = opts.x; this.y = opts.y;
      this.angle = opts.angle || 0;
      this.vx = 0; this.vy = 0;
      this.hp = opts.def.hp;
      this.ammo = opts.def.ammo;
      this.r = 6; // 被弹丸命中的判定半径（不对舰船产生碰撞）
      this.dead = false;
      this.reachedHome = false; // 安全返航（vs 战损）
      this.state = 'fly';
      this.fireT = 0;
      this.life = 0;
    }

    targetOf(game) {
      const c = this.carrier;
      let t = c.isPlayer ? game.playerTarget : (c.ai ? c.ai.target : null);
      if (t && t.alive && !t.removed && t.team !== this.team) return t;
      return game.nearestEnemyOf(c);
    }

    update(dt, game) {
      this.life += dt;
      if (this.dead) return;
      const home = this.carrier;
      const t = this.state === 'return' ? null : this.targetOf(game);
      const lowAmmo = this.ammo <= 0, lowHp = this.hp < this.def.hp * 0.3;
      let tx, ty, desSpeed, mode;
      // UFO 式主动闪避：临近敌方弹丸且朝我逼近 → 垂直弹道方向拉开
      let dodgeGoal = null;
      if (game.projectiles) {
        for (const pr of game.projectiles) {
          if (pr.dead || pr.team === this.team) continue;
          const ddx = this.x - pr.x, ddy = this.y - pr.y;
          if (Math.hypot(ddx, ddy) < 135) {
            const pvx = Math.sin(pr.angle) * pr.speed, pvy = -Math.cos(pr.angle) * pr.speed;
            if (ddx * pvx + ddy * pvy > 0) {  // 弹朝我来
              const perp = Math.atan2(pvy, pvx) + Math.PI / 2;
              let ex = Math.cos(perp), ey = Math.sin(perp);
              if (ddx * ex + ddy * ey < 0) { ex = -ex; ey = -ey; }
              dodgeGoal = { x: this.x + ex * 95, y: this.y + ey * 95, sp: this.def.speed * 1.3 };
              break;
            }
          }
        }
      }
      if (dodgeGoal) {
        mode = 'dodge'; tx = dodgeGoal.x; ty = dodgeGoal.y; desSpeed = dodgeGoal.sp;
      } else if (this.state === 'return' || lowAmmo || lowHp) {
        mode = 'return'; tx = home.x; ty = home.y; desSpeed = this.def.speed * 1.1;
        const d = U.dist(this.x, this.y, home.x, home.y);
        if (d < 80) { this.dead = true; this.reachedHome = true; return; }
      } else if (home.launchMode && t && t.alive && t.team !== this.team) {
        mode = 'fly'; tx = t.x; ty = t.y; desSpeed = this.def.speed;
      } else {
        // 待命/巡逻：有敌舰靠近(母舰或自身警戒圈内)则迎击, 否则在母舰身边编队盘旋
        let near = null;
        for (const s of game.ships) {
          if (s.team === this.team || !s.alive || s.removed) continue;
          if (U.dist(this.x, this.y, s.x, s.y) < 260 || U.dist(home.x, home.y, s.x, s.y) < 300) { near = s; break; }
        }
        if (near) { mode = 'fly'; tx = near.x; ty = near.y; desSpeed = this.def.speed; }
        else {
          mode = 'hold';
          const ang = game.time * 0.5 + this.idx * (Math.PI * 2 / Math.max(1, this.def.squad));
          const rr = Math.max(50, home.radius + 46);
          tx = home.x + Math.cos(ang) * rr; ty = home.y - Math.sin(ang) * rr; desSpeed = this.def.speed * 0.5;
        }
      }
      this.state = mode;
      const spread = mode === 'fly' && t ? (this.idx - (this.def.squad - 1) / 2) * 26 : 0;
      const des = U.angleOf(tx - this.x, ty - this.y);
      this.angle = approachAngle(this.angle, des, this.def.turn * dt);
      const nv = U.clamp(desSpeed, 0, this.def.speed * 1.4);
      const tvx = Math.sin(this.angle) * nv, tvy = -Math.cos(this.angle) * nv;
      this.vx += (tvx - this.vx) * Math.min(1, 3.5 * dt);
      this.vy += (tvy - this.vy) * Math.min(1, 3.5 * dt);
      if (spread !== 0) {
        const px = -this.vy / Math.max(20, Math.hypot(this.vx, this.vy));
        const py = this.vx / Math.max(20, Math.hypot(this.vx, this.vy));
        this.x += px * spread * dt * 2; this.y += py * spread * dt * 2;
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (mode === 'fly' && t && this.ammo > 0) {
        const d = U.dist(this.x, this.y, t.x, t.y);
        this.fireT -= dt;
        if (d < this.def.range && this.fireT <= 0) { this.fireT = this.def.refire; this.ammo--; game.fighterFire(this, t); }
      }
    }
  }

  /* ============================================================
     特效粒子
     ============================================================ */
  class Effect {
    constructor(opts) {
      this.type = opts.type || 'spark';
      this.x = opts.x; this.y = opts.y;
      this.vx = opts.vx || 0; this.vy = opts.vy || 0;
      this.life = 0; this.maxLife = opts.maxLife || 1;
      this.size = opts.size || 3;
      this.color = opts.color || '#fff';
      this.grav = opts.grav || 0;
      this.text = opts.text || '';
      this.angle = opts.angle || 0;
      this.alpha = 1;
    }
    update(dt) {
      this.life += dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.grav) this.vy += this.grav * dt;
      this.alpha = Math.max(0, 1 - this.life / this.maxLife);
    }
  }

  /* ============================================================
     舰船
     ============================================================ */
  class Ship {
    constructor(hullDef, team, game, opts) {
      opts = opts || {};
      this.hullDef = hullDef;
      this.team = team;
      this.game = game;
      this.isPlayer = !!opts.isPlayer;
      this.dummy = !!opts.dummy;
      this.x = opts.x || 0; this.y = opts.y || 0;
      this.heading = opts.heading || 0;
      this.vx = 0; this.vy = 0;
      this.name = opts.name || hullDef.name;
      this.loadout = opts.loadout || null;
      this.hullmods = this.loadout ? this.loadout.hullmods : [];
      // 远征模式：升级芯片 + 遗物属性 + OP 调校
      const st = D.computeStats(hullDef.id, this.hullmods,
        this.loadout ? this.loadout.upgrades : null,
        this.loadout ? this.loadout.relics : null,
        this.loadout ? this.loadout.opTuning : null);
      const sc = opts.scale || { hp: 1, dmg: 1 };
      this.hullMax = st.hull * sc.hp; this.hull = this.hullMax;
      this.armorMax = st.armor * sc.hp; this.armor = this.armorMax;
      this.maxSpeed = st.maxSpeed; this.accel = st.accel;
      this.turnRate = st.turnRate * DEG;
      this.heatCap = st.heatCap; this.heatDiss = st.heatDiss;
      this.rangeMult = st.rangeMult; this.ammoMult = st.ammoMult;
      this.repair = st.repair; this.flakMult = st.flakMult;
      this.dmgMult = st.dmgMult * sc.dmg;
      this.heatMult = st.heatMult;
      this.torpResist = st.torpResist;
      this.untargetableT = 0;
      this.revCap = hullDef.rev || 0.55;       // 倒车上限（航速比例）
      this.strafeCap = hullDef.strafe || 0.4;  // 横推上限（航速比例）
      this.strafe = 0;                          // 横推输入（-1 左 / 1 右）
      // 损管护盾：开关 / 折算系数 / 硬损伤占用（开启时伤害折算为热量）
      this.shield = { on: false, coef: st.shieldCoef || 1.0, hard: 0 };   // 默认盾关：开盾有持续耗热成本
      // 指挥过载（热量超限的失能状态：火力失能、护盾不再吸收，仍可移动）
      this.overloadT = 0;
      this.wasOverloaded = false;
      this.radius = hullDef.radius;
      this.draft = hullDef.draft || 1; // 吃水深度：深水鱼雷对吃水不足的小艇无效
      this.heat = 0;
      this.heatSoft = 0; // 软热量：开火/护盾维持/维修产生，散热可快速排空
      this.vent = { active: false, t: 0, lock: 0 };
      this.alive = true; this.sinking = 0; this.deadT = 0; this.removed = false;
      this.damageTaken = 0; this.damageDealt = 0;
      this.lastDamageT = -999;
      this.wake = []; this.wakeT = 0;
      this.smokeT = 0;
      this.throttle = 0; this.turnDir = 0;
      this.engineSndT = 0;
      this.weapons = [];
      this.bays = [];    // 载机机库（整备系统管理）
      this.prep = 100;   // 整备值 0-100：越低整备/发射越慢；补充战损载机消耗整备
      this.launchMode = false;   // 载机：true=出击 / false=收队待命(默认)；玩家按 Z 出击, 敌方由 AI
      this.groups = [null];
      // 装配武器（载机单独进机库，不进常规武器列表）
      if (this.loadout) {
        for (const slotId in this.loadout.weapons) {
          const slot = hullDef.slots.find(s => s.id === slotId);
          const wdef = D.WEAPONS[this.loadout.weapons[slotId]];
          if (!slot || !wdef) continue;
          if (wdef.kind === 'fighter') {
            this.bays.push({ def: wdef, slotId, squad: [], state: 'ready', timer: 0, missing: 0, rearming: 0 });
            continue;
          }
          this.weapons.push(new WeaponInst(slot, wdef, this, game));
        }
      }
      // 分组
      for (let g = 1; g <= 5; g++) {
        const src = this.loadout && this.loadout.groups ? this.loadout.groups[g] : null;
        const gi = { idx: g, auto: src ? !!src.auto : true, weapons: [] };
        this.groups.push(gi);
      }
      for (const w of this.weapons) {
        let placed = false;
        if (this.loadout && this.loadout.groups) {
          for (let g = 1; g <= 5; g++) {
            const gr = this.loadout.groups[g];
            if (gr && gr.weapons.indexOf(w.slot.id) >= 0) {
              this.groups[g].weapons.push(w); w.groupIdx = g; placed = true; break;
            }
          }
        }
        if (!placed) { this.groups[1].weapons.push(w); w.groupIdx = 1; }
      }
      // AI 状态（性格由 buildFleet 传入）
      this.ai = makeAi(opts.skill || D.ALLY_SKILL, opts.persona || 'steady', { escort: !!opts.escort });
    }

    takeDamage(raw, game, srcKind, dtype, penRatio) {
      if (!this.alive) return;
      if ((srcKind === 'torpedo' || srcKind === 'missile') && this.torpResist && this.torpResist !== 1) {
        raw *= this.torpResist;
      }
      const dt = dtype || DTYPE_OF[srcKind] || 'kin';
      const mSh = SHIELD_MULT[dt] || 1;
      const mAr = ARMOR_MULT[dt] || 1;
      let eff = Math.max(raw * 0.18, raw * mAr - this.armor * 0.9);
      this.armor = Math.max(this.armorMax * 0.25, this.armor - raw * 0.1);
      // 损管护盾：开启且未过载时，伤害不经过装甲减免、按类型倍率折算为热量 + 硬损伤占用
      // （动能 2× 打盾、高爆 0.5×、破片 0.25×、光束 1×）
      if (this.shield && this.shield.on && !this.overloaded() && eff > 0) {
        // 直击穿透（鱼雷/导弹）：高额比例绕过护盾直接打船体（护盾只吸收剩余部分）
        const pen = (penRatio || 0) > 0 ? Math.min(1, penRatio) : 0;
        let hullLoss = 0;
        if (pen > 0) {
          hullLoss = Math.max(raw * pen * 0.18, raw * pen * mAr - this.armor * 0.9);
          this.hull -= hullLoss;
        }
        const sEff = raw * mSh * (1 - pen);
        const heatAdd = sEff * SHIELD_HEAT * this.shield.coef;
        const hardAdd = sEff * SHIELD_HARD * this.shield.coef;
        if (this.heat + heatAdd <= this.heatCap) {
          this.shield.hard = Math.min(this.heatCap, this.shield.hard + hardAdd);
          this.heatSoft += heatAdd; // 护盾吸收：0.42 部分进软热量，0.28 部分进硬损伤
          this.recalcHeat();
          this.damageTaken += raw;
          if (this.isPlayer) game.stats.playerTaken += raw;
          this.lastDamageT = game.time;
          if (this.isPlayer && game.time - game.lastDcFxT > 0.1) {
            game.lastDcFxT = game.time;
            game.addSpark(this.x + U.rand(-8, 8), this.y + U.rand(-10, 10), '#7fe8c8', 2);
          }
          if (this.hull <= 0) {
            this.hull = 0;
            game.onShipSunk(this);
          }
          return eff + hullLoss;
        }
        this.hull += hullLoss; // 热容不足走船体承伤分支时，穿透部分不重复扣
      }
      // 护盾关闭 / 过载 / 热容量不足 → 船体承伤
      this.hull -= eff;
      this.damageTaken += raw;
      if (this.isPlayer) game.stats.playerTaken += raw;
      this.lastDamageT = game.time;
      if (this.hull <= 0) {
        this.hull = 0;
        game.onShipSunk(this);
      }
      return eff;
    }

    /** 开关损管护盾（返回新状态）；散热中强制关盾、不可开关 */
    toggleShield() {
      if (!this.alive) return this.shield.on;
      if (this.vent.active) return this.shield.on;
      this.shield.on = !this.shield.on;
      return this.shield.on;
    }

    /** 总热量 = 软热量（开火/维持/维修）+ 硬热量（护盾吸收的硬损伤占用） */
    recalcHeat() {
      const hard = this.shield ? this.shield.hard : 0;
      this.heat = Math.min(this.heatCap * 1.02, this.heatSoft + hard);
    }

    /** 是否处于指挥过载失能状态 */
    overloaded() {
      return this.overloadT > 0 || this.heat >= this.heatCap * 0.995;
    }

    updateMovement(dt, game) {
      if (!this.alive) {
        // 沉没动画：关闭光束
        for (const w of this.weapons) if (w.beamOn) w.beamOn = false;
        this.sinking += dt;
        this.deadT += dt;
        this.vx *= Math.max(0, 1 - 0.8 * dt);
        this.vy *= Math.max(0, 1 - 0.8 * dt);
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (Math.random() < dt * 10) game.addBubble(this.x + U.rand(-this.radius / 2, this.radius / 2), this.y + U.rand(-this.radius / 2, this.radius / 2));
        if (Math.random() < dt * 5) game.addSmoke(this.x + U.rand(-this.radius / 2, this.radius / 2), this.y + U.rand(-this.radius / 2, this.radius / 2), 5 + Math.random() * 6);
        if (this.sinking > 3.2) this.removed = true;
        return;
      }
      const f = U.dirOf(this.heading);
      const r = { x: f.y, y: -f.x };
      // 推力（含倒车）与横推
      const throttle = this.throttle;
      if (throttle > 0) {
        this.vx += f.x * this.accel * throttle * dt;
        this.vy += f.y * this.accel * throttle * dt;
      } else if (throttle < 0) {
        this.vx += f.x * this.accel * 0.65 * throttle * dt;
        this.vy += f.y * this.accel * 0.65 * throttle * dt;
      }
      if (this.strafe !== 0) {
        this.vx += r.x * this.accel * 0.7 * this.strafe * dt;
        this.vy += r.y * this.accel * 0.7 * this.strafe * dt;
      }
      // ★ 水面阻力：不推进时速度指数衰减
      const drag = 0.72;
      const keep = Math.max(0, 1 - drag * dt);
      this.vx *= keep; this.vy *= keep;
      // 分轴限速：前进最快 > 倒车其次 > 横推最慢（小船差距小、大船差距大）
      const dmgMult = this.hull / this.hullMax < 0.2 ? 0.58 : (this.hull / this.hullMax < 0.4 ? 0.8 : 1);
      const maxSp = this.maxSpeed * dmgMult;
      let vF = this.vx * f.x + this.vy * f.y;
      let vL = this.vx * r.x + this.vy * r.y;
      vF = U.clamp(vF, -maxSp * this.revCap, maxSp);
      vL = U.clamp(vL, -maxSp * this.strafeCap, maxSp * this.strafeCap);
      this.vx = f.x * vF + r.x * vL;
      this.vy = f.y * vF + r.y * vL;
      let sp = Math.hypot(this.vx, this.vy);
      // 转向（随航速变化：低速转不动舵）
      const spf = U.clamp(sp / (this.maxSpeed * 0.5), 0, 1);
      const turnRate = this.turnRate * (0.22 + 0.78 * spf);
      this.heading = U.normAngle(this.heading + this.turnDir * turnRate * dt);
      // 大角度转向掉速
      if (this.turnDir !== 0 && sp > 5) {
        const k = Math.max(0, 1 - 0.4 * dt * Math.abs(this.turnDir));
        this.vx *= k; this.vy *= k;
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      // 世界边界
      const m = 80;
      if (this.x < m) { this.x = m; if (this.vx < 0) this.vx *= -0.4; }
      if (this.x > game.worldW - m) { this.x = game.worldW - m; if (this.vx > 0) this.vx *= -0.4; }
      if (this.y < m) { this.y = m; if (this.vy < 0) this.vy *= -0.4; }
      if (this.y > game.worldH - m) { this.y = game.worldH - m; if (this.vy > 0) this.vy *= -0.4; }
      // 尾迹
      sp = Math.hypot(this.vx, this.vy);
      this.wakeT -= dt;
      if (sp > 24 && this.wakeT <= 0) {
        this.wakeT = 0.055;
        const stx = this.x - f.x * this.hullDef.len / 2;
        const sty = this.y - f.y * this.hullDef.len / 2;
        this.wake.push({ x: stx, y: sty, t: 0, w: this.hullDef.beam * 0.5 });
        if (this.wake.length > 100) this.wake.shift();
        // 舰艏浪花
        if (sp > this.maxSpeed * 0.45 && Math.random() < 0.7) {
          const bx = this.x + f.x * this.hullDef.len / 2;
          const by = this.y + f.y * this.hullDef.len / 2;
          game.addFoam(bx + U.rand(-4, 4), by + U.rand(-3, 3), 1.2);
        }
      }
      for (const p of this.wake) p.t += dt;
      while (this.wake.length && this.wake[0].t > 2.3) this.wake.shift();
      if (sp < 10) { this.wake = []; }
      // 受损冒烟 / 起火
      if (this.hull / this.hullMax < 0.62) {
        this.smokeT -= dt;
        if (this.smokeT <= 0) {
          this.smokeT = 0.3;
          game.addSmoke(this.x + U.rand(-this.radius / 2, this.radius / 2), this.y + U.rand(-this.radius / 2, this.radius / 2), 4 + Math.random() * 5);
          if (this.hull / this.hullMax < 0.3 && Math.random() < 0.5) {
            game.addFire(this.x + U.rand(-8, 8), this.y + U.rand(-10, 10));
          }
        }
      }
      // 损管维修（占用软热量槽，过载时失效）
      if (this.repair > 0 && this.alive && !this.overloaded() && game.time - this.lastDamageT > 8) {
        this.hull = Math.min(this.hullMax, this.hull + this.repair * dt);
        this.heatSoft += this.repair * 0.4 * dt;
        this.recalcHeat();
      }
      // 损管护盾：关闭且软热量散尽后（先软后硬）硬损伤才开始缓慢消散（被动 0.6×；散热中走主动 6×）
      if (this.shield && !this.vent.active) {
        if (!this.shield.on && this.heatSoft <= 0.5) {
          this.shield.hard = Math.max(0, this.shield.hard - this.heatDiss * 0.6 * dt);
        }
        this.shield.hard = Math.min(this.heatCap, this.shield.hard);
      }
      // 主动散热：强制关盾（散热期间不可开关/无法开火）
      if (this.vent.active && this.shield) this.shield.on = false;
      // 护盾维持热量：开盾不是无成本的，持续消耗软热量（低系数=更高效）
      if (this.shield && this.shield.on) {
        this.heatSoft += this.heatCap * SHIELD_UPKEEP * this.shield.coef * dt;
        this.recalcHeat();
      }
      this.recalcHeat(); // 用最新软/硬热量做过载判定
      // 指挥过载：总热量触及上限 → 短暂失能（火力失能、护盾不再吸收，仍可移动）
      if (this.heat >= this.heatCap) {
        this.heatSoft = Math.max(0, this.heatCap - (this.shield ? this.shield.hard : 0));
        this.recalcHeat();
        if (!this.wasOverloaded) {
          this.overloadT = 2.2;
          game.msg((this.isPlayer ? '⚠ 指挥过载！' : '⚠ ' + this.name + ' 指挥过载！') + '火力失能、护盾不再吸收', 'feed-warn');
          snd('alarm');
          game.addSpark(this.x, this.y, '#ff9a3d', 8);
        }
      }
      this.wasOverloaded = this.heat >= this.heatCap;
      if (this.overloadT > 0) this.overloadT -= dt;
      // 散热：软热量 6× 高速排空；散热持续到完全散热为止（软热量散尽后硬热量也以 6× 消散）
      const diss = this.heatDiss * (this.vent.active ? 6 : 1);
      this.heatSoft = Math.max(0, this.heatSoft - diss * dt);
      if (this.vent.active) {
        if (this.heatSoft <= 0.5 && this.shield) {
          this.shield.hard = Math.max(0, this.shield.hard - this.heatDiss * 6 * dt);
        }
        this.vent.t += dt;
        // 到完全散热为止：软硬热量全部排空才结束（时长随热量动态变化）
        if (this.heatSoft <= 0.5 && (!this.shield || this.shield.hard <= 0.5)) {
          this.vent.active = false;
          this.vent.lock = 0;
        }
      }
      this.recalcHeat();
      // 引擎水声
      this.engineSndT -= dt;
      if (sp > this.maxSpeed * 0.6 && this.engineSndT <= 0 && this.isPlayer) {
        this.engineSndT = 1.6;
        snd('whoosh');
      }
    }
  }

  /* ============================================================
     战斗主类
     ============================================================ */
  class Game {
    constructor(cfg) {
      this.worldW = 3400;
      this.worldH = 2300;
      this.ships = [];
      this.projectiles = [];
      this.fighters = []; // 在空中的载机（无舰船碰撞，可被弹丸/光束/爆炸命中）
      this.effects = [];
      this.time = 0;
      this.paused = false;
      this.over = null; // null | 'victory' | 'defeat'
      this.overT = 0;
      this.camera = { x: 0, y: 0, zoom: 1 };
      this.viewW = 1280; this.viewH = 720;
      this.messages = [];
      this.torpWarnT = -99;
      this.lastDcFxT = -99;
      this.stats = { enemiesSunk: 0, alliesLost: 0, playerDamage: 0, playerTaken: 0 };
      this.usedConsumables = [false, false, false];
      this.input = {
        throttle: 0, rudder: 0, autoHelm: false,
        aimX: 0, aimY: 0, fire: false,
        selectedGroup: 1, zoom: 1, strafe: 0
      };
      this.cfg = cfg;
      if (cfg.tutorial) this.buildTutorialFleet(cfg); else this.buildFleet(cfg);
      this.playerTarget = this.nearestEnemyOf(this.player);
      // 初始瞄准点（正前方远处）
      if (this.player) {
        this.input.aimX = this.player.x + 400;
        this.input.aimY = this.player.y;
      }
    }

    buildFleet(cfg) {
      const W = this.worldW, H = this.worldH;
      const enemySkill = cfg.enemySkill || null;
      const enemyScale = cfg.enemyScale || { hp: 1, dmg: 1 };
      const allyScale = cfg.allyScale || { hp: 1, dmg: 1 };
      // 玩家旗舰
      const plHull = D.HULLS[cfg.loadout.hullId];
      this.player = new Ship(plHull, 'ally', this, {
        isPlayer: true, loadout: cfg.loadout,
        x: 600, y: H / 2, heading: Math.PI / 2, name: cfg.loadout.name || plHull.name
      });
      this.ships.push(this.player);
      // 僚舰（与旗舰并排护航，分担火力）；支持完整改装（cfg.escorts）或预设 id（cfg.allies）
      const allyNames = D.NAMES.ally.slice().sort(() => Math.random() - 0.5);
      const escorts = cfg.escorts || (cfg.allies || []).map(presetId => ({ presetId }));
      escorts.forEach((e, i) => {
        if (e.loadout) {
          const hull = D.HULLS[e.loadout.hullId];
          const s = new Ship(hull, 'ally', this, {
            loadout: e.loadout, name: (allyNames[i] || '僚舰') + '号',
            x: 560 + (i % 2) * 80, y: H / 2 - 300 + i * 600, heading: Math.PI / 2,
            skill: D.ALLY_SKILL, scale: allyScale,
            persona: e.persona || 'steady',
            escort: true
          });
          this.ships.push(s);
        } else {
          const preset = D.PRESETS[e.presetId];
          if (!preset) return;
          const loadout = D.buildLoadout(preset.hullId, preset.weapons, preset.hullmods, { player: false });
          const hull = D.HULLS[preset.hullId];
          const s = new Ship(hull, 'ally', this, {
            loadout, name: (allyNames[i] || '僚舰') + '号',
            x: 560 + (i % 2) * 80, y: H / 2 - 300 + i * 600, heading: Math.PI / 2,
            skill: D.ALLY_SKILL, scale: allyScale,
            persona: ALLY_PERSONA[e.presetId] || 'steady',
            escort: true
          });
          this.ships.push(s);
        }
      });
      // 敌军
      const diff = D.DIFFICULTIES[cfg.difficultyId] || D.DIFFICULTIES.skirmish;
      const skill = enemySkill || diff.skill;
      const enList = cfg.enemyPresets || diff.enemy;
      const enNames = D.NAMES.enemy.slice().sort(() => Math.random() - 0.5);
      enList.forEach((presetId, i) => {
        const preset = D.PRESETS[presetId];
        if (!preset) return;
        const loadout = D.buildLoadout(preset.hullId, preset.weapons, preset.hullmods, { player: false });
        const hull = D.HULLS[preset.hullId];
        const s = new Ship(hull, 'enemy', this, {
          loadout, name: (enNames[i] || '敌舰') + '号',
          x: W - 600 + (i % 2) * 200, y: H / 2 - 230 + i * 230 - (i % 2) * 60,
          heading: -Math.PI / 2, skill: skill, scale: enemyScale,
          persona: ENEMY_PERSONA[presetId] || 'steady'
        });
        this.ships.push(s);
      });
    }

    /* ---------- 教程战斗：玩家 + 被动靶舰 ---------- */
    buildTutorialFleet(cfg) {
      const W = this.worldW, H = this.worldH;
      const plHull = D.HULLS[cfg.loadout.hullId];
      this.player = new Ship(plHull, 'ally', this, {
        isPlayer: true, loadout: cfg.loadout,
        x: 600, y: H / 2, heading: Math.PI / 2, name: cfg.loadout.name || plHull.name
      });
      this.ships.push(this.player);
      // 教程：开局护盾关闭、武器不自动开火(让玩家学会开盾/手动开火)
      this.player.shield.on = false;
      if (this.player.groups) for (const kk in this.player.groups) if (this.player.groups[kk]) this.player.groups[kk].auto = false;
      this.player.hullMax = 1e9; this.player.hull = 1e9;  // 教程无敌
      // 被动靶舰：dummy=true → 不移动/不攻击，仅在开阔水域练习开火/锁定
      ['dd_gun', 'dd_torp'].forEach((presetId, i) => {
        const preset = D.PRESETS[presetId]; if (!preset) return;
        const lo = D.buildLoadout(preset.hullId, preset.weapons, preset.hullmods, { player: false });
        const s = new Ship(D.HULLS[preset.hullId], 'enemy', this, {
          loadout: lo, name: '训练靶机' + (i + 1),
          x: 1500 + i * 260, y: H / 2 + (i % 2 ? 130 : -130),
          heading: -Math.PI / 2, skill: 0, dummy: true, scale: { hp: 4, dmg: 1 }
        });
        this.ships.push(s);
      });
    }

    /* ---------- 查询 ---------- */
    aliveEnemiesOf(ship) {
      const list = [];
      for (const s of this.ships) {
        if (s.team !== ship.team && s.alive && !s.removed) list.push(s);
      }
      list.sort((a, b) => U.dist2(ship.x, ship.y, a.x, a.y) - U.dist2(ship.x, ship.y, b.x, b.y));
      return list;
    }
    nearestEnemyOf(ship) {
      const list = this.aliveEnemiesOf(ship);
      return list.length ? list[0] : null;
    }
    /** 敌方选取目标（烟幕中的玩家不可被锁定） */
    targetableOf(ship, t) {
      if (t && t.isPlayer && t.untargetableT > 0) return null;
      return t;
    }

    /* ---------- 消息 ---------- */
    msg(text, cls) {
      this.messages.push({ text, cls: cls || 'feed-info', t: 0 });
      if (this.messages.length > 8) this.messages.shift();
    }
    torpedoWarn() {
      if (this.time - this.torpWarnT < 2.5) return;
      this.torpWarnT = this.time;
      this.msg('⚠ 鱼雷来袭！注意规避！', 'feed-warn');
      snd('alarm');
    }

    /* ---------- 特效 ---------- */
    addEffect(e) { this.effects.push(e); if (this.effects.length > 600) this.effects.shift(); }
    addSpark(x, y, color, n) {
      for (let i = 0; i < (n || 6); i++) {
        const a = Math.random() * U.TAU, sp = U.rand(30, 160);
        this.addEffect(new Effect({
          type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          maxLife: U.rand(0.2, 0.55), size: U.rand(1.5, 3), color: color || '#ffd27a', grav: 160
        }));
      }
    }
    addSmoke(x, y, size) {
      this.addEffect(new Effect({
        type: 'smoke', x, y, vx: U.rand(-8, 8), vy: U.rand(-14, -4),
        maxLife: U.rand(1.2, 2.2), size: size || 6, color: '#5a5f66'
      }));
    }
    addFire(x, y) {
      this.addEffect(new Effect({
        type: 'fire', x, y, vx: U.rand(-6, 6), vy: U.rand(-30, -12),
        maxLife: U.rand(0.3, 0.7), size: U.rand(5, 10), color: '#ff9a3d'
      }));
    }
    addFoam(x, y, size) {
      this.addEffect(new Effect({
        type: 'foam', x, y, vx: U.rand(-10, 10), vy: U.rand(-8, 8),
        maxLife: U.rand(0.5, 1.4), size: size || 1.4, color: '#dff4ff'
      }));
    }
    addBubble(x, y) {
      this.addEffect(new Effect({
        type: 'bubble', x, y, vx: U.rand(-4, 4), vy: U.rand(-30, -10),
        maxLife: U.rand(0.6, 1.4), size: U.rand(2, 5), color: '#bfe8ff'
      }));
    }
    addFlash(x, y, angle, sizeName) {
      const s = sizeName === 'large' ? 16 : (sizeName === 'medium' ? 11 : 8);
      this.addEffect(new Effect({
        type: 'flash', x, y, angle, maxLife: 0.12, size: s, color: '#ffe9a8'
      }));
      // 炮口烟
      for (let i = 0; i < 2; i++) {
        this.addEffect(new Effect({
          type: 'smoke', x: x + U.rand(-3, 3), y: y + U.rand(-3, 3),
          vx: Math.sin(angle) * U.rand(20, 50), vy: -Math.cos(angle) * U.rand(20, 50),
          maxLife: U.rand(0.4, 0.9), size: U.rand(3, 6), color: '#8a8f96'
        }));
      }
    }
    addSplash(x, y, scale) {
      scale = scale || 1;
      this.addEffect(new Effect({ type: 'ring', x, y, maxLife: 0.7, size: 14 * scale, color: '#dff4ff' }));
      for (let i = 0; i < 10 * scale; i++) {
        const a = Math.random() * U.TAU, sp = U.rand(40, 170) * scale;
        this.addEffect(new Effect({
          type: 'foam', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60 * scale,
          maxLife: U.rand(0.4, 0.9), size: U.rand(1.5, 3.5), color: '#e8f7ff', grav: 260
        }));
      }
      snd('splash', 0.25 * scale + 0.15);
    }
    addExplosion(x, y, scale) {
      scale = scale || 1;
      this.addEffect(new Effect({ type: 'ring', x, y, maxLife: 0.6, size: 26 * scale, color: '#ffd9a0' }));
      for (let i = 0; i < 16 * scale; i++) {
        const a = Math.random() * U.TAU, sp = U.rand(60, 260) * scale;
        this.addEffect(new Effect({
          type: 'fire', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          maxLife: U.rand(0.3, 0.8), size: U.rand(6, 14), color: Math.random() < 0.5 ? '#ffb45a' : '#ff7a3d'
        }));
      }
      for (let i = 0; i < 10 * scale; i++) {
        const a = Math.random() * U.TAU, sp = U.rand(30, 150) * scale;
        this.addEffect(new Effect({
          type: 'smoke', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
          maxLife: U.rand(0.8, 1.8), size: U.rand(6, 12), color: '#6a6f76'
        }));
      }
      this.addSplash(x, y, scale * 1.6);
      snd('explosion', 0.6 + scale * 0.5);
    }
    addText(x, y, text, color) {
      this.addEffect(new Effect({
        type: 'text', x, y, vy: -46, maxLife: 0.9, size: 13, color: color || '#fff', text
      }));
    }
    addWakePoint(x, y, angle, alpha) {
      this.addEffect(new Effect({
        type: 'wakep', x, y, maxLife: 1.8, size: 3.5, color: '#e8f6ff', angle, alpha
      }));
    }

    /* ---------- 教程：靶机打一轮(练开盾/散热) ---------- */
    tutorialVolley() {
      const p = this.player; if (!p || !p.alive) return;
      const d = this.ships.find(s => s.dummy && s.alive); if (!d) return;
      const base = U.angleOf(p.x - d.x, p.y - d.y);
      for (let i = 0; i < 6; i++) {
        const ang = base + (i - 2.5) * 0.05;
        const mx = d.x + Math.sin(ang) * 16, my = d.y - Math.cos(ang) * 16;
        this.projectiles.push(new Projectile({ kind: 'gun', x: mx, y: my, angle: ang, speed: 520, dmg: 12, dtype: 'kin', team: 'enemy', hp: 0, owner: d, def: { kind: 'gun', dtype: 'kin', range: 1100 }, r: 3, maxLife: 3.2 }));
      }
      this.msg('靶机打来一轮！按 <b>X</b> 开盾抵挡', 'feed-warn');
    }

    /* ---------- 开火 ---------- */
    fireShot(w, aimA, tgt) {
      this._fired = true;
      const def = w.def, ship = w.ship;
      const spread = (def.spread || 0) * DEG;
      const fireA = w.slot.type === 'fixed'
        ? ship.heading + U.gauss(spread * 0.3)
        : aimA + U.gauss(spread * 0.4);
      w.angle = fireA;
      const mp = w.worldPos();
      const moff = w.muzzleOff();
      const mx = mp.x + Math.sin(fireA) * moff;
      const my = mp.y - Math.cos(fireA) * moff;
      let p;
      if (def.kind === 'torpedo' || def.kind === 'missile') {
        p = new Projectile({
          kind: def.kind, x: mx, y: my, angle: fireA, speed: def.projSpeed,
          dmg: def.dmg * ship.dmgMult, dtype: def.dtype, team: ship.team, hp: def.projHP || 0, def, owner: ship,
          target: def.kind === 'missile' ? (tgt || this.pickMissileTarget(ship)) : null,
          turn: def.turn || 0,
          r: def.kind === 'torpedo' ? 8 : 4.5,
          maxLife: def.range / def.projSpeed
        });
        this.addSplash(mx, my, 0.5);
        snd('launch');
      } else {
        p = new Projectile({
          kind: def.kind, x: mx, y: my, angle: fireA, speed: def.projSpeed,
          dmg: def.dmg * ship.dmgMult, dtype: def.dtype, team: ship.team, hp: 1, def, owner: ship,
          r: def.kind === 'bolt' ? 5.5 : 3.2,
          maxLife: def.range / def.projSpeed
        });
        snd(def.kind === 'bolt' ? 'zap' : 'cannon',
          w.slot.size === 'large' ? 1.1 : (w.slot.size === 'medium' ? 0.75 : 0.45));
      }
      p.vx += ship.vx;
      p.vy += ship.vy;
      this.projectiles.push(p);
      if (def.ammo) w.ammo -= 1;
      w.flash = 0.12;
      ship.heatSoft += (def.heat || 0) * ship.heatMult;
      ship.recalcHeat();
      this.addFlash(mx, my, fireA, w.slot.size);
    }

    fireVolley(w, aimA, tgt) {
      if (!w.ready()) return;
      this.fireShot(w, aimA, tgt);
      w.cooldown = w.def.refire;
      if (w.def.burst && w.def.burst > 1) {
        w.burstLeft = w.def.burst - 1;
        w.burstTimer = w.def.burstInterval;
        w.burstAim = aimA;
      }
    }

    pickMissileTarget(ship) {
      // 导弹锁定：玩家锁定的目标优先，否则最近敌舰
      if (ship.isPlayer && this.playerTarget && this.playerTarget.alive &&
          this.playerTarget.team !== ship.team) {
        return this.playerTarget;
      }
      return this.targetableOf(ship, this.nearestEnemyOf(ship));
    }

    /* ---------- 瞄准判定 ---------- */
    aimInfo(w, tx, ty) {
      const s = w.ship;
      const wc = s.heading + w.slot.center * DEG;
      const dx = tx - s.x, dy = ty - s.y;
      const dist = Math.hypot(dx, dy);
      let okArc, angle;
      if (w.slot.type === 'fixed') {
        okArc = Math.abs(U.relAngle(s.heading, dx, dy)) <= w.slot.arc * DEG / 2 + 5 * DEG;
        angle = s.heading;
      } else {
        okArc = Math.abs(U.relAngle(wc, dx, dy)) <= w.slot.arc * DEG / 2 + 5 * DEG;
        angle = U.angleOf(dx, dy);
      }
      const inRange = dist <= w.range + 40;
      return { ok: okArc, inRange: inRange, angle: angle, dist: dist };
    }

    canFireHeat(w) {
      const s = w.ship;
      if (s.vent.active || s.vent.lock > 0) return false;
      if (s.overloaded()) return false;
      if (w.def.kind === 'beam') return s.heat < s.heatCap * 0.85;
      return s.heat + w.heatPerShot() <= s.heatCap * 0.99;
    }

    /* ---------- 玩家火控 ---------- */
    playerFireControl(dt) {
      const s = this.player;
      if (!s || !s.alive) return;
      const inp = this.input;
      const sel = s.groups[inp.selectedGroup];
      // 关闭非当前组且非自动组的光束
      for (let g = 1; g <= 5; g++) {
        const gr = s.groups[g];
        if (!gr) continue;
        if (g !== inp.selectedGroup && !gr.auto) {
          for (const w of gr.weapons) if (w.def.kind === 'beam') w.beamOn = false;
        }
      }
      // 手动开火（炮塔需旋转对准后方可发射）
      if (sel && inp.fire) {
        for (const w of sel.weapons) {
          if (w.def.kind === 'beam') {
            const info = this.aimInfo(w, inp.aimX, inp.aimY);
            if (info.ok && info.inRange && this.canFireHeat(w)) {
              w.aimAt(info.angle);
              if (w.aligned(info.angle)) w.beamOn = true;
            } else {
              w.beamOn = false;
              w.trackAim = false;
            }
          } else if (w.ready() && this.canFireHeat(w)) {
            const info = this.aimInfo(w, inp.aimX, inp.aimY);
            if (info.ok && info.inRange) {
              w.aimAt(info.angle);
              if (w.aligned(info.angle)) this.fireVolley(w, info.angle);
            }
          }
        }
      } else if (sel) {
        for (const w of sel.weapons) if (w.def.kind === 'beam') w.beamOn = false;
      }
      // 自动开火组（选中组若正按住开火则跳过，避免双控）
      for (let g = 1; g <= 5; g++) {
        const gr = s.groups[g];
        if (!gr || !gr.auto) continue;
        if (g === inp.selectedGroup && inp.fire) continue;
        for (const w of gr.weapons) {
          // ★ 玩家旗舰的点防御：自动组里的防空武器优先拦截来袭鱼雷
          if ((w.def.torpMult || 1) >= 1.5 && this.canFireHeat(w)) {
            const pt = this.pdTargetFor(s, w);
            if (pt) {
              const aimP = this.aimAtProjectile(w, pt);
              if (w.def.kind === 'beam') {
                w.aimAt(aimP);
                if (w.aligned(aimP)) w.beamOn = true;
                continue;
              }
              if (w.ready()) {
                w.aimAt(aimP);
                if (!w.aligned(aimP)) continue;
                w.acquire -= dt;
                if (w.acquire <= 0) {
                  this.fireVolley(w, aimP + U.gauss(0.015));
                  w.acquire = 0.08 + Math.random() * 0.1;
                }
                continue;
              }
            }
          }
          if (w.def.kind === 'beam') {
            const t = this.autofireTargetFor(s, w);
            if (!t) { w.beamOn = false; continue; }
            const info = this.aimAtShip(w, t);
            if (info.ok && info.inRange && this.canFireHeat(w)) {
              w.aimAt(info.angle);
              if (w.aligned(info.angle)) w.beamOn = true;
            } else w.beamOn = false;
          } else if (w.ready() && this.canFireHeat(w)) {
            const t = this.autofireTargetFor(s, w);
            if (!t) { w.acquire = 0; continue; }
            const info = this.aimAtShip(w, t);
            if (!info.ok || !info.inRange) { w.acquire = 0; continue; }
            w.aimAt(info.angle);
            if (!w.aligned(info.angle)) continue; // 炮塔旋转中
            w.acquire -= dt;
            if (w.acquire <= 0) {
              this.fireVolley(w, info.angle + U.gauss(0.02), t);
              w.acquire = 0.12 + Math.random() * 0.15;
            }
          }
        }
      }
    }

    autofireTarget(ship) {
      if (ship.isPlayer) {
        if (this.playerTarget && this.playerTarget.alive && this.playerTarget.team !== ship.team) {
          return this.playerTarget;
        }
        const list = this.aliveEnemiesOf(ship);
        return list.length ? list[0] : null;
      }
      return ship.ai && ship.ai.target && ship.ai.target.alive
        ? this.targetableOf(ship, ship.ai.target)
        : this.targetableOf(ship, this.nearestEnemyOf(ship));
    }

    /** 武器级自动开火目标：主目标（锁定/AI 目标）打不到时，
        改打射界内、射程内能命中的敌人（残血补刀 > 距离）。 */
    autofireTargetFor(ship, w) {
      let best = null, bestScore = -Infinity;
      const des = this.autofireTarget(ship);
      for (const e of this.aliveEnemiesOf(ship)) {
        if (ship.ai && e.isPlayer && e.untargetableT > 0) continue; // AI 看不见烟幕中的玩家
        const info = this.aimAtShip(w, e);
        if (!info.ok || !info.inRange) continue;
        const d = U.dist(ship.x, ship.y, e.x, e.y);
        // 伤害类型效率（远行星号 AttackAIModule：动能克盾、高爆克甲、破片打裸船体）
        const dt = w.def.dtype || DTYPE_OF[w.def.kind] || 'kin';
        const vsSh = e.shield && e.shield.on && !e.overloaded();
        const eff = (vsSh ? SHIELD_MULT : ARMOR_MULT)[dt] || 1;
        const score = (1 - e.hull / e.hullMax) * 450 - d + (eff - 1) * 260 + (e === des ? 160 : 0);
        if (score > bestScore) { bestScore = score; best = e; }
      }
      return best;
    }

    aimAtShip(w, t) {
      const s = w.ship;
      const dx = t.x - s.x, dy = t.y - s.y;
      const dist = Math.hypot(dx, dy);
      const range = w.range;
      if (dist > range) return { ok: false, inRange: false, angle: 0, dist: dist };
      const wc = s.heading + w.slot.center * DEG;
      let ok, aimA;
      if (w.slot.type === 'fixed') {
        ok = Math.abs(U.relAngle(s.heading, dx, dy)) <= w.slot.arc * DEG / 2 + 8 * DEG;
        aimA = s.heading;
      } else {
        ok = Math.abs(U.relAngle(wc, dx, dy)) <= w.slot.arc * DEG / 2 + 8 * DEG;
        aimA = wc + U.relAngle(wc, dx, dy);
      }
      if (ok && (w.def.kind === 'gun' || w.def.kind === 'bolt' || w.def.kind === 'torpedo')) {
        const tt = dist / w.def.projSpeed;
        aimA = U.angleOf(t.x + t.vx * tt - s.x, t.y + t.vy * tt - s.y);
      }
      return { ok, inRange: true, angle: aimA, dist };
    }

    /* ---------- 点防御：拦截来袭鱼雷/导弹 ---------- */
    pdTargetFor(ship, w) {
      let best = null, bd = w.range;
      for (const p of this.projectiles) {
        if (p.dead || p.team === ship.team || p.hp <= 1) continue;
        const dSelf = U.dist(p.x, p.y, ship.x, ship.y);
        // 鱼雷深水：只有光束能拦截，且只能拦截靠近的「浅层」鱼雷（260px 内）
        if (p.kind === 'torpedo') {
          if (w.def.kind !== 'beam') continue;
          if (dSelf > 260) continue;
        }
        if (dSelf > bd) continue;
        let threat = false;
        // 朝本舰逼近
        if (dSelf < w.range * 0.9) {
          const rx = ship.x - p.x, ry = ship.y - p.y;
          if (p.vx * rx + p.vy * ry > 0) threat = true;
        }
        // 或逼近附近友军（保护旗舰/僚舰）
        if (!threat) {
          for (const o of this.ships) {
            if (o.team !== ship.team || !o.alive) continue;
            if (U.dist(p.x, p.y, o.x, o.y) < 240 && dSelf < w.range) { threat = true; break; }
          }
        }
        if (threat && dSelf < bd) { bd = dSelf; best = p; }
      }
      return best;
    }

    aimAtProjectile(w, p) {
      const s = w.ship;
      const d = U.dist(s.x, s.y, p.x, p.y);
      if (w.def.kind === 'beam') return U.angleOf(p.x - s.x, p.y - s.y);
      const tt = d / w.def.projSpeed;
      return U.angleOf(p.x + p.vx * tt - s.x, p.y + p.vy * tt - s.y);
    }

    /* ---------- NPC 火控 ---------- */
    aiFireControl(ship, dt) {
      const pdCapable = (w) => (w.def.torpMult || 1) >= 1.5;
      for (let g = 1; g <= 5; g++) {
        const gr = ship.groups[g];
        if (!gr) continue;
        if (!gr.auto) {
          for (const w of gr.weapons) if (w.def.kind === 'beam') w.beamOn = false;
          continue;
        }
        for (const w of gr.weapons) {
          // ★ 点防御优先：拦截逼近的鱼雷/导弹（远行星号式 PD；炮塔需旋转对准）
          if (pdCapable(w) && this.canFireHeat(w)) {
            const pt = this.pdTargetFor(ship, w);
            if (pt) {
              const aimP = this.aimAtProjectile(w, pt);
              if (w.def.kind === 'beam') {
                w.aimAt(aimP);
                if (w.aligned(aimP)) w.beamOn = true;
                continue;
              }
              if (w.ready()) {
                w.aimAt(aimP);
                if (!w.aligned(aimP)) continue;
                w.acquire -= dt;
                if (w.acquire <= 0) {
                  this.fireVolley(w, aimP + U.gauss(0.02));
                  w.acquire = 0.08 + Math.random() * 0.12;
                }
                continue;
              }
            }
          }
          if (w.def.kind === 'beam') {
            const t = this.autofireTargetFor(ship, w);
            const info = t ? this.aimAtShip(w, t) : { ok: false, inRange: false };
            if (info.ok && info.inRange && this.canFireHeat(w)) {
              w.aimAt(info.angle);
              if (w.aligned(info.angle)) w.beamOn = true;
            } else w.beamOn = false;
            continue;
          }
          if (!w.ready() || !this.canFireHeat(w)) { w.acquire = 0; continue; }
          const t = this.autofireTargetFor(ship, w);
          if (!t) { w.acquire = 0; continue; }
          const info = this.aimAtShip(w, t);
          if (!info.ok || !info.inRange) { w.acquire = 0; continue; }
          // 炮塔以自身转速追踪目标，对准后方可开火
          w.aimAt(info.angle);
          if (!w.aligned(info.angle)) continue;
          w.acquire -= dt;
          if (w.acquire <= 0) {
            const err = ship.ai.skill.aimErr * U.gauss(0.6);
            this.fireVolley(w, info.angle + err, t);
            w.acquire = ship.ai.skill.react * U.rand(0.7, 1.4);
          }
        }
      }
    }

    /* ---------- 光束伤害 ---------- */
    beamTick(w) {
      const ship = w.ship;
      const wp = w.worldPos();
      const dir = U.dirOf(w.angle);
      const ex = wp.x + dir.x * w.range;
      const ey = wp.y + dir.y * w.range;
      let bestShip = null, bestProj = null, bd = w.range;
      for (const s of this.ships) {
        if (s.team === ship.team || !s.alive) continue;
        const d = U.distToSeg(s.x, s.y, wp.x, wp.y, ex, ey);
        if (d < s.radius) {
          const t = U.clamp(((s.x - wp.x) * dir.x + (s.y - wp.y) * dir.y), 0, w.range);
          if (t < bd) { bd = t; bestShip = s; bestProj = null; }
        }
      }
      for (const p of this.projectiles) {
        if (p.dead || p.team === ship.team || p.hp <= 1) continue;
        const d = U.distToSeg(p.x, p.y, wp.x, wp.y, ex, ey);
        if (d < p.r + 2) {
          const t = U.clamp(((p.x - wp.x) * dir.x + (p.y - wp.y) * dir.y), 0, w.range);
          if (t < bd) { bd = t; bestProj = p; bestShip = null; }
        }
      }
      w.beamHit = bd;
      const tickDmg = w.def.dmg * 0.1 * ship.dmgMult;
      // 光束 vs 载机：光束穿过载机继续照射，载机持续受灼烧
      for (const f of this.fighters) {
        if (f.dead || f.team === ship.team) continue;
        const d = U.distToSeg(f.x, f.y, wp.x, wp.y, ex, ey);
        if (d < f.r + 2) {
          f.hp -= tickDmg * 2.2;
          this.addSpark(f.x + U.rand(-3, 3), f.y + U.rand(-3, 3), '#b48cff', 2);
          if (f.hp <= 0) f.dead = true;
        }
      }
      if (bestShip) {
        const hx = wp.x + dir.x * bd, hy = wp.y + dir.y * bd;
        const eff = bestShip.takeDamage(tickDmg, this, 'beam', w.def.dtype);
        if (ship.isPlayer) this.stats.playerDamage += eff;
        this.addSpark(hx, hy, '#b48cff', 3);
        if (Math.random() < 0.5) snd('splash', 0.12);
      } else if (bestProj) {
        bestProj.hp -= tickDmg * (w.def.torpMult || 1) * ship.flakMult;
        this.addSpark(bestProj.x, bestProj.y, '#bfe8ff', 3);
        if (bestProj.hp <= 0) {
          bestProj.dead = true;
          this.addSplash(bestProj.x, bestProj.y, 0.9);
        }
      }
    }

    /* ---------- 命中 ---------- */
    /** 爆炸结算（引信触发 → 范围覆盖 → 伤害衰减）；命中船全额+直击穿透、范围内其他船按距离衰减 */
    blastSettle(p, blast, directShip) {
      for (const t of this.ships) {
        if (!t.alive || t.removed || t === p.owner) continue;
        // 深水鱼雷：吃水不足的船免疫（从下方穿过）
        if (p.kind === 'torpedo' && (p.def.depth || 1) > (t.draft || 1)) continue;
        const d = U.dist(p.x, p.y, t.x, t.y);
        if (d > blast + t.radius) continue;
        const f = Math.max(0.3, 1 - Math.max(0, d - t.radius) / blast);
        // 直击穿透只作用于被直接命中的船（鱼雷/导弹高额直击比例绕过护盾）
        const pen = t === directShip ? (p.def.pen || 0) : 0;
        const eff = t.takeDamage(p.dmg * f, this, p.kind, p.dtype, pen);
        if (p.owner) {
          p.owner.damageDealt += p.dmg * f;
          if (p.owner.isPlayer) this.stats.playerDamage += eff;
        }
        this.addText(t.x + U.rand(-10, 10), t.y - 14, U.fmt(eff), eff > 200 ? '#ffd27a' : '#ffffff');
        if (t.isPlayer) snd('splash', 0.3);
      }
      // 爆炸波及载机（无舰船碰撞体积，但会被爆炸命中）
      for (const f of this.fighters) {
        if (f.dead) continue;
        const d = U.dist(p.x, p.y, f.x, f.y);
        if (d > blast + f.r) continue;
        const ff = Math.max(0.2, 1 - d / blast);
        f.hp -= p.dmg * ff * 0.3;
        if (f.hp <= 0) f.dead = true;
      }
    }

    projHitShip(p, s) {
      p.dead = true;
      const blast = p.def.blast || 0;
      if (p.kind === 'torpedo' || p.kind === 'missile') {
        this.addExplosion(p.x, p.y, p.kind === 'torpedo' ? (p.def.size === 'large' ? 1.6 : 1.1) : 0.8);
        const owner = p.owner;
        if (owner && owner.isPlayer) snd('cannon', 1.2);
      } else {
        this.addSplash(p.x, p.y, 0.45);
        this.addSpark(p.x, p.y, p.kind === 'bolt' ? '#b48cff' : '#ffd27a', 6);
        snd('splash', 0.18);
      }
      if (blast > 0) {
        // 爆炸类武器：范围结算（命中船在爆炸中心，全额伤害 + 直击穿透）
        this.blastSettle(p, blast, s);
        return;
      }
      const eff = s.takeDamage(p.dmg, this, p.kind, p.dtype);
      if (p.owner) {
        p.owner.damageDealt += p.dmg;
        if (p.owner.isPlayer) this.stats.playerDamage += eff;
      }
      this.addText(p.x + U.rand(-10, 10), p.y - 14, U.fmt(eff), eff > 200 ? '#ffd27a' : '#ffffff');
      if (s.isPlayer) {
        snd('splash', 0.3);
      }
    }

    collide(dt) {
      // 近炸引信：爆炸类弹体进入目标船引信半径即引爆（先于碰撞判定）
      for (const p of this.projectiles) {
        if (p.dead || (p.kind !== 'torpedo' && p.kind !== 'missile')) continue;
        const blast = p.def.blast || 0;
        if (blast <= 0) continue;
        const fuseR = blast * 0.75;
        for (const s of this.ships) {
          if (s.removed || !s.alive || s.team === p.team) continue;
          if (p.kind === 'torpedo' && (p.def.depth || 1) > (s.draft || 1)) continue;
          if (U.circleHit(p.x, p.y, fuseR, s.x, s.y, s.radius)) {
            this.projHitShip(p, s);
            break;
          }
        }
      }
      // 弹丸 vs 舰船（深水鱼雷从小艇下方穿过，不触发）
      for (const p of this.projectiles) {
        if (p.dead) continue;
        for (const s of this.ships) {
          if (s.removed || !s.alive || s.team === p.team) continue;
          if (p.kind === 'torpedo' && (p.def.depth || 1) > (s.draft || 1)) continue;
          if (U.circleHit(p.x, p.y, p.r, s.x, s.y, s.radius)) {
            this.projHitShip(p, s);
            break;
          }
        }
      }
      // 弹丸拦截弹丸（鱼雷/导弹可被击毁）
      const ps = this.projectiles;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (p.dead || p.hp <= 1) continue;
        for (let j = 0; j < ps.length; j++) {
          if (i === j) continue;
          const q = ps[j];
          if (q.dead || q.team === p.team || q.hp <= 1) continue;
          if (U.circleHit(p.x, p.y, p.r, q.x, q.y, q.r)) {
            const pdmg = p.dmg * (p.def.torpMult || 1) * (p.owner ? p.owner.flakMult : 1);
            const qdmg = q.dmg * (q.def.torpMult || 1) * (q.owner ? q.owner.flakMult : 1);
            q.hp -= pdmg;
            p.hp -= qdmg;
            this.addSpark((p.x + q.x) / 2, (p.y + q.y) / 2, '#ffe9a8', 5);
            if (q.hp <= 0) { q.dead = true; this.addSplash(q.x, q.y, 0.8); }
            if (p.hp <= 0) { p.dead = true; this.addSplash(p.x, p.y, 0.8); }
            if (p.dead || q.dead) break;
          }
        }
      }
      // 弹丸 vs 载机（载机无舰船碰撞体积，但会被弹丸/光束/爆炸命中）
      for (const p of this.projectiles) {
        if (p.dead) continue;
        for (const f of this.fighters) {
          if (f.dead || f.team === p.team) continue;
          if (U.circleHit(p.x, p.y, p.r, f.x, f.y, f.r)) {
            f.hp -= p.dmg;
            this.addSpark(f.x, f.y, '#ffe9a8', 4);
            p.dead = true;
            if (f.hp <= 0) f.dead = true;
            break;
          }
        }
      }
      // 舰船分离
      for (let i = 0; i < this.ships.length; i++) {
        for (let j = i + 1; j < this.ships.length; j++) {
          const a = this.ships[i], b = this.ships[j];
          if (!a.alive || !b.alive || a.removed || b.removed) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const min = a.radius + b.radius + 4;
          if (d < min && d > 0.01) {
            const nx = dx / d, ny = dy / d;
            const push = (min - d) / 2;
            a.x -= nx * push; a.y -= ny * push;
            b.x += nx * push; b.y += ny * push;
            const damp = Math.max(0, 1 - 3 * dt);
            a.vx *= damp; a.vy *= damp;
            b.vx *= damp; b.vy *= damp;
          }
        }
      }
    }

    /* ---------- 舰船沉没 ---------- */
    onShipSunk(ship) {
      ship.alive = false;
      ship.sinking = 0.001;
      this.addExplosion(ship.x, ship.y, Math.max(0.7, ship.hullDef.len / 90));
      snd('explosion', 1.4);
      if (ship.team === 'enemy') {
        this.stats.enemiesSunk++;
        this.msg('☠ ' + ship.name + '（' + ship.hullDef.cls + '）被击沉！', 'feed-enemy');
      } else {
        this.stats.alliesLost++;
        this.msg('✝ ' + ship.name + '（' + ship.hullDef.cls + '）沉没了……', 'feed-ally');
      }
      if (this.playerTarget === ship) this.playerTarget = null;
      if (ship.isPlayer) {
        this.msg('⚠ 旗舰沉没！', 'feed-warn');
      }
    }

    /* ---------- 玩家操作 ---------- */
    applyPlayerInput(dt) {
      const s = this.player;
      if (!s || !s.alive) return;
      const inp = this.input;
      s.throttle = inp.throttle;
      s.strafe = inp.strafe || 0;
      if (inp.autoHelm) {
        const des = U.angleOf(inp.aimX - s.x, inp.aimY - s.y);
        const diff = U.angleDiff(des, s.heading);
        s.turnDir = U.clamp(diff / (s.turnRate * 0.18), -1, 1);
      } else {
        s.turnDir = inp.rudder;
      }
    }

    startVent(ship) {
      if (ship.vent.active || ship.vent.lock > 0 || ship.heat < 20) return;
      ship.vent.active = true;
      ship.vent.t = 0;
      // 主动散热 = 高风险高收益：强制关盾（散热期间不可开关/无法开火）
      if (ship.shield) ship.shield.on = false;
      this.msg(ship.name + ' 开始主动散热（护盾关闭）', 'feed-info');
      snd('whoosh');
    }
    playerVentRequest() {
      if (this.player && this.player.alive) this.startVent(this.player);
    }
    cycleTarget() {
      const list = this.aliveEnemiesOf(this.player);
      if (!list.length) { this.playerTarget = null; return; }
      const idx = list.indexOf(this.playerTarget);
      this.playerTarget = list[(idx + 1) % list.length];
    }
    targetNearest() {
      this.playerTarget = this.nearestEnemyOf(this.player);
    }

    /* ---------- 远征消耗品 ---------- */
    useConsumable(idx) {
      const cfg = this.cfg;
      if (!cfg.consumables || !cfg.consumables[idx] || this.usedConsumables[idx]) return false;
      const id = cfg.consumables[idx];
      const s = this.player;
      if (!s || !s.alive || this.over) return false;
      this.usedConsumables[idx] = true;
      switch (id) {
        case 'cons_repair':
          s.hull = Math.min(s.hullMax, s.hull + s.hullMax * 0.3);
          this.msg('🔧 修理工具：船体已修复 30%', 'feed-info');
          for (let i = 0; i < 10; i++) {
            this.addBubble(s.x + U.rand(-s.radius / 2, s.radius / 2), s.y + U.rand(-s.radius / 2, s.radius / 2));
          }
          break;
        case 'cons_coolant':
          s.heat = 0; s.heatSoft = 0;
          if (s.shield) s.shield.hard = 0; // 应急冷却剂：软硬热量全部清空
          s.recalcHeat();
          this.msg('❄ 应急冷却剂：热量已清空（含硬损伤）', 'feed-info');
          for (let i = 0; i < 8; i++) {
            this.addEffect(new Effect({
              type: 'foam', x: s.x + U.rand(-10, 10), y: s.y + U.rand(-12, 12),
              vx: U.rand(-15, 15), vy: U.rand(-40, -10),
              maxLife: U.rand(0.4, 0.9), size: U.rand(1.5, 3), color: '#c8f0ff'
            }));
          }
          break;
        case 'cons_ammo':
          for (const w of s.weapons) {
            if (w.def.ammo) w.ammo = Math.min(w.ammoMax, w.ammo + 2);
          }
          this.msg('📦 弹药补给：导弹/鱼雷备弹 +2', 'feed-info');
          break;
        case 'cons_smoke':
          s.untargetableT = 6;
          this.msg('🌫 烟幕弹：敌军暂时失去你的踪迹', 'feed-info');
          break;
      }
      snd('whoosh');
      return true;
    }

    /* ---------- 主更新 ---------- */
    update(dt) {
      if (this.paused) return;
      dt = Math.min(dt, 0.05);
      this.time += dt;
      const s = this.player;

      // 烟幕特效
      if (s && s.alive && s.untargetableT > 0) {
        s.untargetableT -= dt;
        if (Math.random() < dt * 10) {
          this.addSmoke(s.x + U.rand(-s.radius, s.radius), s.y + U.rand(-s.radius, s.radius), 14 + Math.random() * 14);
        }
      }

      if (s && s.alive) {
        this.applyPlayerInput(dt);
        this.playerFireControl(dt);
      }
      // NPC 行为
      for (const sh of this.ships) {
        if (sh.isPlayer || !sh.alive || sh.removed || sh.dummy) continue;
        this.aiUpdateShip(sh, dt);
        this.aiFireControl(sh, dt);
        this.aiVentControl(sh, dt);
        this.aiShieldControl(sh, dt);
      }
      // 武器冷却 / 光束 / 连发
      for (const sh of this.ships) {
        if (sh.removed) continue;
        for (const w of sh.weapons) w.update(dt, this);
      }
      // 移动
      for (const sh of this.ships) {
        if (sh.removed) continue;
        sh.updateMovement(dt, this);
      }
      // 航母整备 + 载机（在弹丸更新前，保证载机开火入弹丸列表）
      this.updateCarriers(dt);
      // 弹丸
      for (const p of this.projectiles) p.update(dt, this);
      this.collide(dt);
      // 特效
      for (const e of this.effects) e.update(dt);
      // 清理
      this.projectiles = this.projectiles.filter(p => !p.dead);
      this.effects = this.effects.filter(e => e.alpha > 0.01);
      this.fighters = this.fighters.filter(f => !f.dead);
      this.ships = this.ships.filter(sh => !sh.removed);
      // 消息老化
      for (const m of this.messages) m.t += dt;
      this.messages = this.messages.filter(m => m.t < 6.5);
      // 相机（限制在世界范围内）
      if (s) {
        this.camera.x += (s.x - this.camera.x) * Math.min(1, 5 * dt);
        this.camera.y += (s.y - this.camera.y) * Math.min(1, 5 * dt);
        this.camera.zoom += (this.input.zoom - this.camera.zoom) * Math.min(1, 6 * dt);
        const hw = this.viewW / 2 / this.camera.zoom;
        const hh = this.viewH / 2 / this.camera.zoom;
        this.camera.x = U.clamp(this.camera.x, Math.min(hw, this.worldW / 2), Math.max(this.worldW - hw, this.worldW / 2));
        this.camera.y = U.clamp(this.camera.y, Math.min(hh, this.worldH / 2), Math.max(this.worldH - hh, this.worldH / 2));
      }
      // 结束判定
      if (!this.over) {
        const enemiesLeft = this.ships.some(sh => sh.team === 'enemy' && sh.alive);
        if (!enemiesLeft) {
          this.end('victory');
        } else if (s && !s.alive && s.deadT > 2.6) {
          this.end('defeat');
        }
      } else {
        this.overT += dt;
      }
    }

    end(winner) {
      if (this.over) return;
      this.over = winner;
      this.overT = 0;
      if (winner === 'victory') {
        this.msg('✔ 敌方舰队已被全歼！', 'feed-info');
        snd('launch');
      } else {
        this.msg('✖ 旗舰沉没，任务失败……', 'feed-warn');
        snd('explosion', 1.6);
      }
    }

    /* ---------- 航母整备系统 ---------- */

    /** 载机开火：发射一枚小型弹丸（载机武器对舰伤害） */
    fighterFire(f, t) {
      const def = f.def;
      const p = new Projectile({
        kind: 'gun', x: f.x, y: f.y, angle: f.angle, speed: 640,
        dmg: def.dmg * (f.carrier ? f.carrier.dmgMult : 1), dtype: 'kin',
        team: f.team, hp: 1, def: { kind: 'gun', dtype: 'kin' }, owner: f.carrier,
        r: 2.6, maxLife: def.range / 640
      });
      p.vx += f.vx; p.vy += f.vy;
      this.projectiles.push(p);
      this.addSpark(f.x + U.rand(-4, 4), f.y + U.rand(-4, 4), '#ffd27a', 2);
    }

    /** 整备时间倍率：整备值越低越慢（100%→1.0×，0%→2.2×） */
    prepMult(ship) { return 2.2 - 1.2 * (ship.prep / 100); }

    /** 航母整备 + 载机更新：
        机库状态机 ready → launching → airborne →（返航/战损）→ rearming → ready
        补充战损载机消耗整备值；返航整备（弹药/维修免费）期间整备值停止恢复 */
    updateCarriers(dt) {
      // 载机移动
      for (const f of this.fighters) f.update(dt, this);
      // 机库状态机（母舰存活时）
      for (const sh of this.ships) {
        if (sh.removed || !sh.alive || !sh.bays || !sh.bays.length) continue;
        // 整备值恢复：有任何一个机库在整备时暂停
        const anyRearm = sh.bays.some(b => b.state === 'rearming');
        if (!anyRearm) sh.prep = Math.min(100, sh.prep + 2 * dt);
        // 敌方/僚舰 AI 管理载机出动与返航
        if (!sh.isPlayer) sh.launchMode = !!(sh.ai && sh.ai.target && sh.ai.target.alive && sh.hull / sh.hullMax > 0.4 && !sh.vent.active);
        // 返航收队：暂停发射，召回空中载机
        if (!sh.launchMode) {
          // 收队：暂停发射；载机靠 Fighter 逻辑在母舰身边盘旋，只有无弹药/低血才返航整备
          for (const bay of sh.bays) if (bay.state === 'launching') bay.timer = 0;
        }
        for (const bay of sh.bays) {
          const def = bay.def;
          const pm = this.prepMult(sh);
          if (bay.state === 'ready') {
            // 有可攻击目标 → 开始发射（有战损缺口时需整备值足够支付补充）
            const t = sh.isPlayer ? (this.playerTarget || this.nearestEnemyOf(sh)) : (sh.ai ? sh.ai.target : null);
            const hasTarget = t && t.alive && !t.removed && t.team !== sh.team;
            const replaceCost = bay.missing * (def.prepCost || 20);
            if (sh.launchMode && hasTarget && (bay.missing === 0 || sh.prep >= replaceCost)) {
              bay.state = 'launching';
              bay.timer = 1.4 * pm;
            }
          } else if (bay.state === 'launching') {
            bay.timer -= dt;
            if (bay.timer <= 0) {
              // 扣除战损补充的整备值（不足则等待整备恢复）
              const replaceCost = bay.missing * (def.prepCost || 20);
              if (sh.prep < replaceCost) { bay.timer = 0.5; continue; }
              sh.prep -= replaceCost;
              bay.squad = [];
              for (let i = 0; i < def.squad - bay.missing; i++) {
                const f = new Fighter({
                  def, team: sh.team, carrier: sh, bay, idx: i,
                  x: sh.x + U.rand(-20, 20), y: sh.y + U.rand(-16, 16),
                  angle: sh.heading
                });
                bay.squad.push(f);
                this.fighters.push(f);
              }
              bay.missing = 0;
              bay.state = 'airborne';
            }
          } else if (bay.state === 'airborne') {
            // 战损即缺 → 消耗整备生产替补，加入当前中队(不必等全灭)
            if (bay.missing > 0 && sh.prep >= (def.prepCost || 20)) {
              sh.prep -= (def.prepCost || 20);
              bay.missing--;
              const f = new Fighter({ def, team: sh.team, carrier: sh, bay, idx: bay.squad.length, x: sh.x + U.rand(-18, 18), y: sh.y + U.rand(-14, 14), angle: sh.heading });
              bay.squad.push(f); this.fighters.push(f);
            }
            // 全员返航/全灭 → 整备
            const alive = bay.squad.filter(f => !f.dead);
            if (alive.length === 0) {
              bay.state = 'rearming';
              bay.timer = 2.6 * pm;
            }
          } else if (bay.state === 'rearming') {
            bay.timer -= dt;
            if (bay.timer <= 0) { bay.state = 'ready'; bay.squad = []; }
          }
        }
        // 清理机库内已回收/战损的载机（战损计入 missing，返航不计）
        for (const bay of sh.bays) {
          const bdef = bay.def;
          bay.squad = bay.squad.filter(f => {
            if (f.dead) {
              if (!f.reachedHome) bay.missing = Math.min(bdef.squad, bay.missing + 1);
              return false;
            }
            return true;
          });
        }
      }
      // 母舰沉没 → 所属载机全灭
      for (const f of this.fighters) {
        if (f.dead) continue;
        if (!f.carrier || !f.carrier.alive || f.carrier.removed) f.dead = true;
      }
      this.fighters = this.fighters.filter(f => !f.dead);
    }

    /* ---------- NPC AI ---------- */
    aiUpdateShip(ship, dt) {
      if (ship.dummy) { ship.throttle = 0; ship.turnDir = 0; ship.strafe = 0; return; }  // 教程靶机：完全静止
      const ai = ship.ai;
      ai.timer -= dt;
      ai.switchT -= dt;
      if (ai.torpAlignT > 0) ai.torpAlignT -= dt;
      if (!ai.profile) ai.profile = computeRangeProfile(ship);
      // 目标获取（带人类反应延迟；烟幕中的玩家不可被锁定）
      if ((!ai.target || !ai.target.alive || ai.target.removed ||
           (ai.target.isPlayer && ai.target.untargetableT > 0)) && ai.switchT <= 0) {
        ai.target = this.aiPickTarget(ship);
        ai.switchT = ai.skill.targetDelay * U.rand(0.7, 1.2);
        ai.state = 'approach';
        ai.side = Math.random() < 0.5 ? -1 : 1;
      }
      // 周期重估目标（远行星号威胁评估持续重估：明显更优才切换，避免抖动）
      ai.repickT = (ai.repickT || 0) - dt;
      if (ai.repickT <= 0 && ai.target && ai.target.alive && !ai.target.removed && ai.state !== 'backoff') {
        ai.repickT = 2.5;
        const alt = this.aiPickTarget(ship);
        if (alt && alt !== ai.target &&
            this.scoreTarget(ship, alt) > this.scoreTarget(ship, ai.target) + 18) {
          ai.target = alt;
          ai.torpAlignT = 0;
          ai.repickT = 3.5; // 切换后冷却更长，避免来回横跳
        }
      }
      // 决策节流
      if (ai.timer <= 0) {
        ai.timer = ai.skill.interval * U.rand(0.85, 1.2);
        if (ai.target && ai.target.alive && !ai.target.removed) {
          this.aiDecide(ship);
        } else {
          ai.branch = 'idle';
          ai.throttle = 0;
          ai.desiredHeading = ship.heading;
        }
      }
      // 鱼雷规避（快速通道，人类反应速度；连续规避超时则接受风险，避免无限横飞）
      if ((ai.evadeChainT || 0) > 3) { ai.evadeT = 0; ai.evadeLockT = 2.5; ai.evadeChainT = 0; }
      this.aiEvadeCheck(ship, dt);
      if (ai.evadeT > 0) ai.evadeChainT = (ai.evadeChainT || 0) + dt;
      else ai.evadeChainT = 0;
      if (ai.evadeLockT > 0) ai.evadeLockT -= dt;
      // 输出转向/油门/横推
      let desired = ai.desiredHeading;
      let thr = ai.throttle;
      let str = ai.strafe || 0;
      // 鱼雷规避：后撤中不覆盖（后撤本身就在脱离）；其余状态用边界修正后的规避方向
      if (ai.evadeT > 0 && ai.state !== 'backoff') {
        ai.branch = 'evade';
        const bs = this.boundSteer(ship, ai.evadeDir);
        // 兼顾作战方向：把规避方向向战斗航向往回拉 45%，避免垂直横飞脱离战斗
        desired = bs.desired + U.angleDiff(ai.desiredHeading, bs.desired) * 0.45;
        thr = bs.force ? 0.45 : 0.85;
        str = 0;
      }
      // 舰船避碰（远行星号 CollisionAnalysisModule）：帧级预测覆盖，逼近时避让并减速
      if (!ship.isPlayer) {
        const av = this.avoidShips(ship, desired);
        if (av) {
          desired = av.dir;
          if (av.urgent) { thr = Math.min(thr, 0.55); str = 0; }
        }
      }
      ship.turnDir = U.clamp(U.angleDiff(desired, ship.heading) / (ship.turnRate * 0.22), -1, 1);
      ship.throttle = thr;
      ship.strafe = str;
    }

    /** 目标评分选择（远行星号式：能破防 > 残血补刀 > 距离 > 集火 > 火力分散） */
    /** 目标评分（远行星号 AttackAIModule 目标排序的简化版：可破防>残血>威胁>距离>集火） */
    scoreTarget(ship, t) {
      let score = 0;
      const d = U.dist(ship.x, ship.y, t.x, t.y);
      // 能否破防：不能则大幅减分
      if (!canPenetrate(ship, t)) score -= 35;
      // 残血补刀
      score += (1 - t.hull / t.hullMax) * 22;
      // 护盾关闭 → 直击船体易破防；过载 → 无法吸收；快过载（热>85%）→ 护盾即将失效
      if (t.shield && !t.shield.on) score += 14;
      if (t.overloaded()) score += 9;
      if (t.heat / t.heatCap > 0.85) score += 6;
      // 敌方锁定我 → 优先反击（远行星号：最大威胁优先）
      if (t.ai && t.ai.target === ship) score += 12;
      // 距离惩罚
      score -= d / 350;
      // 追不上且正在远离的目标减分
      const tSp = Math.hypot(t.vx, t.vy);
      const mySp = Math.hypot(ship.vx, ship.vy);
      const fleeing = U.dist(t.x + t.vx, t.y + t.vy, ship.x, ship.y) > d;
      if (fleeing && tSp > mySp * 1.1 && d > 400) score -= 18;
      // 已有我方舰在打它 → 分散火力
      let attackers = 0;
      for (const o of this.ships) {
        if (o.team === ship.team && o.ai && o.ai.target === t) attackers++;
      }
      score -= attackers * 6;
      // 友军跟随玩家集火 / 保护旗舰
      if (!ship.isPlayer && this.player && this.player.alive && ship.team === 'ally') {
        if (this.playerTarget === t) score += 14;
        const dp = U.dist(t.x, t.y, this.player.x, this.player.y);
        score -= dp / 260;
      }
      // 比我大得多且状态良好的目标减分（稳健保命）
      if (t.hullMax > ship.hullMax * 2 && t.hull / t.hullMax > 0.6) score -= 5;
      return score;
    }

    aiPickTarget(ship) {
      const list = this.aliveEnemiesOf(ship).filter(t => !(t.isPlayer && t.untargetableT > 0));
      if (!list.length) return null;
      let best = list[0], bestScore = -Infinity;
      for (const t of list) {
        const score = this.scoreTarget(ship, t);
        if (score > bestScore) { bestScore = score; best = t; }
      }
      return best;
    }

    /* ---------- NPC AI 决策辅助 ---------- */

    /** 危险评估（远行星号威胁评估的简化版）：
        只看船体血量比例（护盾不参与——护盾只影响承伤方式，不影响 AI 决策）。
        level: 0=安全 1=受压 2=危险 */
    aiDanger(ship) {
      const p = ship.ai.p;
      const eff = ship.hull / ship.hullMax;
      let level = 0;
      if (eff < p.fleeHull) level = 2;
      else if (eff < p.fleeHull * 1.6) level = 1;
      return { level, eff, heatRatio: ship.heat / ship.heatCap };
    }

    /** 最近敌人距离 */
    nearestEnemyDist(ship) {
      let best = Infinity;
      for (const e of this.aliveEnemiesOf(ship)) {
        const d = U.dist(ship.x, ship.y, e.x, e.y);
        if (d < best) best = d;
      }
      return best;
    }

    /** 敌人最远火力射程（用于计算安全撤离距离） */
    enemyMaxRange(ship) {
      let r = 0;
      for (const e of this.aliveEnemiesOf(ship)) {
        for (const w of e.weapons) if (w.range > r) r = w.range;
      }
      return r;
    }

    /** 综合撤离方向：所有敌人远离方向的加权平均；被多方向包围时平均趋近零，
        退化为背对最近敌人（避免朝敌舰冲的假逃逸） */
    escapeDir(ship) {
      let ax = 0, ay = 0, n = 0;
      for (const e of this.aliveEnemiesOf(ship)) {
        const d = U.dist(ship.x, ship.y, e.x, e.y);
        ax += (ship.x - e.x) / Math.max(50, d);
        ay += (ship.y - e.y) / Math.max(50, d);
        n++;
      }
      if (!n) return ship.heading;
      if (Math.hypot(ax, ay) < 0.25 * n) {
        const nb = this.nearestEnemyOf(ship);
        if (nb) return U.angleOf(ship.x - nb.x, ship.y - nb.y);
      }
      return U.angleOf(ax, ay);
    }

    /** 墙边切向修正：撤离方向若朝墙内去，取消该轴分量（沿墙滑行） */
    wallTangent(ship, dir) {
      const W = this.worldW, H = this.worldH;
      const m = 220;
      const v = U.dirOf(dir);
      let vx = v.x, vy = v.y;
      if (ship.x < m && vx < 0) vx = 0;
      if (ship.x > W - m && vx > 0) vx = 0;
      if (ship.y < m && vy < 0) vy = 0;
      if (ship.y > H - m && vy > 0) vy = 0;
      if (vx === 0 && vy === 0) {
        // 撤离方向完全被墙挡住 → 沿墙切向（朝地图中心一侧）
        if (ship.x < m || ship.x > W - m) return (ship.y < H / 2) ? Math.PI : 0;
        if (ship.y < m || ship.y > H - m) return (ship.x < W / 2) ? Math.PI / 2 : -Math.PI / 2;
        return dir;
      }
      return U.angleOf(vx, vy);
    }

    aiDecide(ship) {
      if (ship.dummy) return;   // 教程靶舰：不决策、不移动、不攻击
      const ai = ship.ai;
      const t = ai.target;
      const dx = t.x - ship.x, dy = t.y - ship.y;
      const dist = Math.hypot(dx, dy);
      const bearing = U.angleOf(dx, dy);
      const profile = ai.profile || (ai.profile = computeRangeProfile(ship));
      const p = ai.p;
      const danger = this.aiDanger(ship);
      const nearD = this.nearestEnemyDist(ship);
      const eMaxR = this.enemyMaxRange(ship);
      // 撤离目标距离：跑出敌人射程 + 性格余量（胆小者撤得更远，危险时再多撤 25%）
      const safeD = eMaxR + p.backMargin * (danger.level === 2 ? 1.25 : 1);
      const canPen = canPenetrate(ship, t);
      const bandMin = profile.preferred * 0.62;
      const bandMax = profile.preferred * 1.12;
      // 高压（热量>78%，或刚被击中且热量>60%）视为受压：外推交战圈
      // （远行星号 flux>0.7 高压后撤 + 被打时威胁×3；护盾吸收伤害 → 热量快速上涨）
      const heatPress = danger.heatRatio > 0.78 ||
        (this.time - ship.lastDamageT < 1 && danger.heatRatio > 0.6);
      const pressured = danger.level >= 1 || heatPress;
      // 目标散热/过载/护盾关闭/快过载（热量>85%）→ 收割窗口
      // （远行星号：目标散热中/过载/高压 flux>0.8 视为可攻击窗口）
      const tWindow = (t.vent && (t.vent.active || t.vent.lock > 0)) || t.overloaded() ||
        (t.shield && !t.shield.on) || (t.heat / t.heatCap > 0.85);

      // ── 状态机：危险后撤有明确撤离距离目标，到点即停，绝不无限直线逃跑 ──
      if (ai.state === 'backoff') {
        ai.branch = 'backoff';
        ai.torpAlignT = 0;
        if (nearD > safeD || danger.level === 0 ||
            (danger.level === 1 && nearD > safeD * 0.75)) {
          ai.state = 'combat';
        }
      } else if (danger.level === 2 && nearD < eMaxR) {
        ai.state = 'backoff';
      } else if (ai.state === 'approach' && dist < Math.min(bandMax * 1.05, profile.maxR * 0.75)) {
        ai.state = 'combat';
      } else if (ai.state === 'combat' && dist > bandMax * 2.4) {
        ai.state = 'approach';
      }

      let throttle = 0;
      let desired = ship.heading;
      ai.strafe = 0; // 每个决策周期先清零，需要平移的分支再设置
      ai.branch = 'none'; // 决策分支标记（诊断工具用）

      if (ai.state === 'backoff') {
        // ★ 撤离：舰艏始终朝敌，用油门+横推沿「墙边修正后的撤离方向」退避，绝不背敌、绝不撞墙
        const nb = this.nearestEnemyOf(ship);
        const face = nb ? U.angleOf(nb.x - ship.x, nb.y - ship.y) : bearing;
        const escape = this.wallTangent(ship, this.escapeDir(ship));
        desired = face;
        if (Math.abs(U.angleDiff(ship.heading, face)) < 1.6) {
          // 已大致面对敌人：按当前舰艏/右舷分解撤离方向
          const f = U.dirOf(ship.heading);
          const r = { x: f.y, y: -f.x };
          const ev = U.dirOf(escape);
          const fwd = ev.x * f.x + ev.y * f.y;
          const lat = ev.x * r.x + ev.y * r.y;
          throttle = U.clamp(fwd, -1, 1);
          ai.strafe = U.clamp(lat, -1, 1);
        } else {
          // 尚未面对敌人：先原地转向，不朝逃离方向冲刺
          throttle = 0;
          ai.strafe = 0;
        }
      } else if (ai.state === 'approach') {
        ai.branch = 'approach';
        throttle = 1;
        // 蛇形接近：横向小幅摆动，避免锁定航向死直冲锋（远行星号式）
        if (ai.weaveSeed === undefined) ai.weaveSeed = Math.random() * Math.PI * 2;
        ai.strafe = Math.sin(this.time * 0.9 + ai.weaveSeed) * 0.55;
        desired = this.interceptAngle(ship, t);
      } else {
        // 战斗：距离控制 + 舷侧 + 鱼雷窗口
        let bMin = bandMin, bMax = bandMax;
        // 受压/无法破防时：把交战圈外推到敌方射程极限（接近对方射程边缘有序周旋，而非开场就逃）
        if (pressured || !canPen) {
          bMin = Math.max(bMin * 1.15, eMaxR * 0.8);
          bMax = Math.max(bMax * 1.12, eMaxR * 1.05);
        }
        if (ai.torpAlignT > 0 && !pressured) {
          ai.branch = 'torpAlign';
          // 鱼雷发射窗口：把目标放进待发鱼雷管的射界
          const tw = readyTorpedo(ship, t);
          if (tw) {
            desired = bearing - tw.slot.center * DEG;
            throttle = 0.6;
          } else {
            ai.torpAlignT = 0;
          }
        } else if (tWindow && !pressured && canPen) {
          ai.branch = 'window';
          // 收割窗口：目标散热/过载时压上去收割
          throttle = 1;
          desired = dist < bMin * 0.7 ? bearing : this.interceptAngle(ship, t);
        } else if (dist > bMax) {
          ai.branch = 'pursue';
          throttle = 1;
          if (ai.weaveSeed === undefined) ai.weaveSeed = Math.random() * Math.PI * 2;
          ai.strafe = Math.sin(this.time * 0.9 + ai.weaveSeed) * 0.55;
          desired = this.interceptAngle(ship, t);
        } else if (dist < bMin * 0.7) {
          ai.branch = 'ram';
          // 贴脸：倒车拉开，舰艏对敌继续开火；侧推滑离（不再背对敌人绕圈折返）
          throttle = -0.85;
          desired = bearing + ai.side * 0.25;
          ai.strafe = ai.side * 0.5;
        } else {
          ai.branch = 'broadside';
          // 舷侧对敌：选择武器覆盖更多的一侧；
          // 舰首炮为主 → 舰艏直指目标 + 强侧推平移环绕（远行星号式平移接舷战）
          // 炮塔为主 → 舷侧角 + 侧推环绕走位（StrafeTargetManeuver）
          let fixedN = 0, turretN = 0;
          for (const w of ship.weapons) { if (w.slot.type === 'fixed') fixedN++; else turretN++; }
          const bs = bestBroadside(ship, bearing);
          if (bs !== 0) ai.side = bs;
          const bowFacing = fixedN > 0 && fixedN >= turretN;
          if (bowFacing) {
            desired = bearing;
            ai.strafe = ai.side * 1.0;
            throttle = p.kite ? 0.25 : 0.45;
          } else {
            desired = bearing + ai.side * 1.15;
            ai.strafe = ai.side * 0.8;
            throttle = p.kite ? 0.55 : 0.8;
          }
          if (Math.random() < 0.01) ai.side *= -1;
          // 鱼雷窗口开启：有备弹、目标在鱼雷射程内、且自身未受压
          if (readyTorpedo(ship, t) && !pressured && Math.random() < 0.05) {
            ai.torpAlignT = 2.0;
          }
        }
      }

      // 僚舰护航：脱离旗舰太远则先归队（不覆盖危险后撤/规避）
      if (ai.escort && ai.state !== 'backoff' && this.player && this.player.alive) {
        const dEsc = U.dist(ship.x, ship.y, this.player.x, this.player.y);
        if (dEsc > 560) {
          ai.branch = 'escort';
          if (ai.weaveSeed === undefined) ai.weaveSeed = Math.random() * Math.PI * 2;
          ai.strafe = Math.sin(this.time * 0.9 + ai.weaveSeed) * 0.35;
          desired = U.angleOf(this.player.x - ship.x, this.player.y - ship.y);
          throttle = 1;
        }
      }
      // 边界回避（后撤已自行处理墙边，其余状态用软/硬边界引导）+ 友舰分离；
      // 不再清空横推——平移环绕是战斗姿态的一部分，硬边界时压低侧推防止贴墙；
      // 舰船避碰移到 aiUpdateShip 每帧执行（预测式，见 avoidShips）
      if (ai.state !== 'backoff') {
        const bs = this.boundSteer(ship, desired);
        desired = bs.desired;
        if (bs.force) { throttle = 0.45; ai.strafe *= 0.3; }
      }
      ai.desiredHeading = desired;
      ai.throttle = throttle;
    }

    interceptAngle(ship, t) {
      const dx = t.x - ship.x, dy = t.y - ship.y;
      const dist = Math.hypot(dx, dy);
      const tt = dist / Math.max(20, ship.maxSpeed * 0.9);
      // 预测点钳制在地图内，避免追着越过墙的拦截点直冲撞墙
      const m = 200;
      const px = U.clamp(t.x + t.vx * tt, m, this.worldW - m);
      const py = U.clamp(t.y + t.vy * tt, m, this.worldH - m);
      return U.angleOf(px - ship.x, py - ship.y);
    }

    boundSteer(ship, desired) {
      const W = this.worldW, H = this.worldH;
      const soft = 340, hard = 120;
      let dx = 0, dy = 0;
      if (ship.x < soft) dx += Math.min(1, (soft - ship.x) / (soft - hard));
      if (ship.x > W - soft) dx -= Math.min(1, (ship.x - (W - soft)) / (soft - hard));
      if (ship.y < soft) dy += Math.min(1, (soft - ship.y) / (soft - hard));
      if (ship.y > H - soft) dy -= Math.min(1, (ship.y - (H - soft)) / (soft - hard));
      if (!dx && !dy) return { desired, force: false };
      const toward = U.angleOf(dx, dy);
      const atWall = ship.x < hard || ship.x > W - hard || ship.y < hard || ship.y > H - hard;
      if (atWall) {
        // 贴墙：强制朝地图内侧，并接管油门向前脱离（避免撞墙卡死）
        return { desired: toward, force: true };
      }
      // 软边界：按接近程度把期望航向朝内偏转（越近越强）
      const push = Math.min(1, Math.hypot(dx, dy));
      desired = desired + U.clamp(U.angleDiff(toward, desired), -2.4, 2.4) * push;
      return { desired, force: false };
    }

    /** 舰船避碰（远行星号 CollisionAnalysisModule）：相对运动预测最近点，
        1.2 秒内可能接触 → 朝对方预测位置反向避让（多威胁加权），逼近紧急时减速+停横推 */
    avoidShips(ship, desired) {
      let ax = 0, ay = 0, urgent = false;
      const tgt = ship.ai ? ship.ai.target : null;
      for (const o of this.ships) {
        if (o === ship || !o.alive || o.removed) continue;
        const dx = o.x - ship.x, dy = o.y - ship.y;
        const d = Math.hypot(dx, dy);
        const min = (ship.radius + o.radius) * 1.35;
        if (d > min * 2.4) continue;
        const rvx = o.vx - ship.vx, rvy = o.vy - ship.vy;
        const sp2 = rvx * rvx + rvy * rvy;
        let t = 0, cpa = d;
        if (sp2 > 1e-6) {
          t = Math.max(0, -(dx * rvx + dy * rvy) / sp2);
          if (t > 1.2) continue; // 1.2 秒后才可能接触 → 暂不避让
          const cx = o.x + rvx * t - ship.x, cy = o.y + rvy * t - ship.y;
          cpa = Math.hypot(cx, cy);
        }
        if (cpa >= min && d >= min * 1.15) continue; // 最近点够远，不会接触
        // 会接触：朝对方预测位置的反方向避让（目标舰权重略降，避免贴身接敌时原地打转）
        const px = o.x + o.vx * t, py = o.y + o.vy * t;
        let wx = ship.x - px, wy = ship.y - py;
        const wm = Math.hypot(wx, wy);
        if (wm < 1) {
          // 预测接触点就在脚下（迎头相撞）：垂直相对速度方向侧避（游戏方位角，dirOf 转向量）
          const perp = U.angleOf(rvx, rvy) + Math.PI / 2;
          wx = Math.sin(perp); wy = -Math.cos(perp);
        } else { wx /= wm; wy /= wm; }
        const w = (o === tgt ? 0.45 : 1) / Math.max(0.15, t + 0.15);
        ax += wx * w;
        ay += wy * w;
        if (t < 0.6 || d < min) urgent = true;
      }
      if (!ax && !ay) return null;
      const away = U.angleOf(ax, ay);
      return { dir: desired + U.clamp(U.angleDiff(away, desired), -1.1, 1.1), urgent };
    }

    /** 来袭弹体威胁评估：直线弹道用解析最近点（精确），制导导弹用轨迹预演 */
    evalThreat(p, ship) {
      const home = p.kind === 'missile' && p.target && p.target.alive;
      if (!home) {
        // 直线弹道（子弹/能量弹/鱼雷）：相对速度求最近点 CPA
        const rvx = p.vx - ship.vx, rvy = p.vy - ship.vy;
        const sp2 = rvx * rvx + rvy * rvy;
        if (sp2 < 1e-6) return { minD: U.dist(p.x, p.y, ship.x, ship.y), tMin: 0 };
        const t = Math.max(0, ((ship.x - p.x) * rvx + (ship.y - p.y) * rvy) / sp2);
        const cx = p.x + p.vx * t - (ship.x + ship.vx * t);
        const cy = p.y + p.vy * t - (ship.y + ship.vy * t);
        return { minD: Math.hypot(cx, cy), tMin: t };
      }
      // 制导导弹：模拟其转向追踪，求最小距离
      let x = p.x, y = p.y;
      let vx = p.vx, vy = p.vy;
      const homeX = p.target.x, homeY = p.target.y;
      const maxTurn = (p.turn || 0) * DEG * EVADE_SIM_DT;
      const simT = Math.min(EVADE_SIM_T, Math.max(0, p.maxLife - p.life));
      let minD = Infinity, tMin = EVADE_SIM_T;
      for (let t = EVADE_SIM_DT; t <= simT + 1e-6; t += EVADE_SIM_DT) {
        const ta = U.angleOf(homeX - x, homeY - y);
        const ca = U.angleOf(vx, vy);
        const na = ca + U.clamp(U.angleDiff(ta, ca), -maxTurn, maxTurn);
        const sp = Math.hypot(vx, vy);
        vx = Math.sin(na) * sp;
        vy = -Math.cos(na) * sp;
        x += vx * EVADE_SIM_DT;
        y += vy * EVADE_SIM_DT;
        const d = U.dist(x, y, ship.x + ship.vx * t, ship.y + ship.vy * t);
        if (d < minD) { minD = d; tMin = t; }
      }
      return { minD, tMin };
    }

    aiEvadeCheck(ship, dt) {
      const ai = ship.ai;
      ai.threatT -= dt;
      if (ai.threatT > 0) return;
      ai.threatT = 0.35;
      if (ai.evadeLockT > 0) return; // 连续规避超时后的接受风险期
      // 护盾完好且热量不高时：子弹/能量弹可被护盾吸收，无需规避（远行星号：护盾能吸收且费用低→无视）
      const shielded = ship.shield && ship.shield.on && !ship.overloaded() && ship.heat < ship.heatCap * 0.7;
      let threat = null, threatT = Infinity;
      for (const p of this.projectiles) {
        if (p.dead || p.team === ship.team) continue;
        if (U.dist(p.x, p.y, ship.x, ship.y) > EVADE_SCAN_R) continue;
        // 深水鱼雷：吃水不足的小艇从上方安全通过，无需规避
        if (p.kind === 'torpedo' && (p.def.depth || 1) > (ship.draft || 1)) continue;
        if (shielded && (p.kind === 'gun' || p.kind === 'bolt')) continue;
        const t = this.evalThreat(p, ship);
        const dangerR = ship.radius + (EVADE_MARGIN[p.kind] || EVADE_MARGIN.gun);
        if (t.minD > dangerR) continue; // 轨迹最近点够远：会从旁边掠过，不躲
        if (t.tMin > (EVADE_REACT[p.kind] || EVADE_REACT.gun)) continue; // 反应上限之外：来不及/不值得躲
        if (t.tMin < threatT) { threat = p; threatT = t.tMin; } // 取最紧急的威胁
      }
      if (threat) {
        // 人类式反应：按熟练度概率规避（远行星号：f18 < 反应时间才标记避碰）
        if (Math.random() < ai.skill.dodge) {
          const tHead = U.angleOf(threat.vx, threat.vy);
          const rel = U.relAngle(tHead, ship.x - threat.x, ship.y - threat.y);
          // 垂直于来袭弹道，选择把船推离弹道线的一侧；墙边做切向修正
          ai.evadeDir = this.wallTangent(ship, tHead + (rel > 0 ? Math.PI / 2 : -Math.PI / 2));
          ai.evadeT = 0.9;
        } else {
          ai.evadeT = 0; // 没反应过来
        }
      } else if (ai.evadeT > 0) {
        ai.evadeT -= dt;
      }
    }

    aiVentControl(ship, dt) {
      const ai = ship.ai;
      ai.ventT -= dt;
      if (ai.ventT > 0) return;
      if (ship.vent.active || ship.vent.lock > 0) return;
      // 安全散热窗口：敌方全部脱离射程才主动散热（散热=强制关盾+停火，高风险）；
      // 有敌人在射程内只做紧急散热（快过载时赌一把）
      const threatR = this.enemyMaxRange(ship) + 60;
      let near = false;
      for (const e of this.aliveEnemiesOf(ship)) {
        if (U.dist(ship.x, ship.y, e.x, e.y) < threatR) { near = true; break; }
      }
      const threshold = near ? 0.95 : 0.68;
      if (ship.heat > ship.heatCap * threshold) {
        this.startVent(ship);
        ai.ventT = 12;
      }
    }

    /** 护盾管理：脱离敌方射程或过载失能 → 关盾让硬损伤消散；
        重新接战且硬损伤基本消散 → 开盾。战斗中被集火时保持护盾。玩家舰不适用（手动控制） */
    aiShieldControl(ship, dt) {
      const ai = ship.ai;
      const sh = ship.shield;
      if (!sh || ship.isPlayer) return;
      ai.shieldT = (ai.shieldT || 0) - dt;
      if (ai.shieldT > 0) return;
      ai.shieldT = 0.4;
      const cap = ship.heatCap || 1;
      const threatR = this.enemyMaxRange(ship) + 60;
      let near = false;
      for (const e of this.aliveEnemiesOf(ship)) {
        if (U.dist(ship.x, ship.y, e.x, e.y) < threatR) { near = true; break; }
      }
      if (sh.on && sh.hard > cap * 0.02) {
        // 过载失能（护盾反正无法吸收），或已脱离敌方射程且最近没挨打 → 关盾让硬损伤消散
        // （远行星号 HAS_INCOMING_DAMAGE：来袭伤害期间保持护盾）
        if (ship.overloaded() || (!near && this.time - ship.lastDamageT > 2)) sh.on = false;
      } else if (near && !ship.overloaded() && !ship.vent.active && sh.hard < cap * 0.05) {
        // 重新接战且硬损伤基本消散 → 开盾（散热中保持强制关盾）
        sh.on = true;
      }
    }
  }

  globalThis.GameCore = { Game, Ship, WeaponInst, Projectile, Effect };
})();
