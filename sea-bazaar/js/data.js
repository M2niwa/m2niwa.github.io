/* ============================================================
   游戏数据：舰体 / 武器 / 插件 / 预设 / 敌方舰队
   ============================================================ */
(function () {
  'use strict';

  const D = {};

  /* ---------------- 舰体 ----------------
     slots: { id, type: 'turret'|'fixed'|'missile', size: 'small'|'medium'|'large',
              center: 槽位中心方向(度, 相对船艏), arc: 射界(度), x: 右舷偏移, y: 艏向偏移 }
     stats: hull 耐久, armor 装甲(每发减伤), maxSpeed 最大航速, accel 加速度,
            turnRate 满速转向速度(度/秒), heatCap 热容, heatDiss 散热(每秒), op 装配点
     len: 舰长, beam: 舰宽, radius: 碰撞半径 */
  D.HULLS = {
    destroyer: {
      id: 'destroyer', name: '浮沫级侦察艇', cls: '侦察艇', ico: '🚤',
      hull: 2400, armor: 170, maxSpeed: 118, accel: 150, turnRate: 62, rev: 0.6, strafe: 0.45,
      heatCap: 1800, heatDiss: 170, op: 70,
      len: 58, beam: 22, radius: 24, draft: 1, // 吃水：浅（小艇，深水鱼雷从下方穿过）
      desc: '拾荒者最爱的快艇，轻快灵活，适合袭扰与打捞。',
      slots: [
        { id: 'fx1', type: 'fixed', size: 'small', center: 0, arc: 10, x: 0, y: 26 },
        { id: 'sm1', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: 12 },
        { id: 'sm2', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: -16 },
        { id: 'ms1', type: 'missile', size: 'small', center: -8, arc: 45, x: -4, y: 22 },
        { id: 'ms2', type: 'missile', size: 'small', center: 8, arc: 45, x: 4, y: 22 }
      ]
    },
    lightCruiser: {
      id: 'lightCruiser', name: '潮纹级护卫舰', cls: '护卫舰', ico: '⛵',
      hull: 4200, armor: 320, maxSpeed: 88, accel: 110, turnRate: 44, rev: 0.55, strafe: 0.4,
      heatCap: 2600, heatDiss: 240, op: 110,
      len: 78, beam: 30, radius: 33, draft: 2, // 吃水：中
      desc: '以潮纹木龙骨打造的多面手，中口径火力可观。',
      slots: [
        { id: 'fx1', type: 'fixed', size: 'medium', center: 0, arc: 7, x: 0, y: 36 },
        { id: 'sm1', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: 30 },
        { id: 'sm2', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: -30 },
        { id: 'md1', type: 'turret', size: 'medium', center: 0, arc: 250, x: 0, y: 16 },
        { id: 'md2', type: 'turret', size: 'medium', center: -90, arc: 160, x: -14, y: -8 },
        { id: 'md3', type: 'turret', size: 'medium', center: 90, arc: 160, x: 14, y: -8 },
        { id: 'ms1', type: 'missile', size: 'small', center: 0, arc: 32, x: 0, y: 34 },
        { id: 'ms2', type: 'missile', size: 'small', center: 180, arc: 70, x: 0, y: -33 }
      ]
    },
    heavyCruiser: {
      id: 'heavyCruiser', name: '破冰级突击巡洋舰', cls: '突击巡洋舰', ico: '🛳️',
      hull: 7000, armor: 620, maxSpeed: 68, accel: 85, turnRate: 31, rev: 0.5, strafe: 0.3,
      heatCap: 3600, heatDiss: 320, op: 160,
      len: 96, beam: 36, radius: 41, draft: 3, // 吃水：深
      desc: '加装破冰艏的重甲巨炮，正面火力凶悍。',
      slots: [
        { id: 'fx1', type: 'fixed', size: 'large', center: 0, arc: 6, x: 0, y: 44 },
        { id: 'sm1', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: 40 },
        { id: 'sm2', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: -40 },
        { id: 'md1', type: 'turret', size: 'medium', center: -30, arc: 160, x: -12, y: 24 },
        { id: 'md2', type: 'turret', size: 'medium', center: 30, arc: 160, x: 12, y: 24 },
        { id: 'md3', type: 'turret', size: 'medium', center: -150, arc: 160, x: -12, y: -22 },
        { id: 'md4', type: 'turret', size: 'medium', center: 150, arc: 160, x: 12, y: -22 },
        { id: 'lg1', type: 'turret', size: 'large', center: 0, arc: 300, x: 0, y: 4 },
        { id: 'lg2', type: 'turret', size: 'large', center: 180, arc: 300, x: 0, y: -26 },
        { id: 'ms1', type: 'missile', size: 'medium', center: -80, arc: 55, x: -17, y: 8 },
        { id: 'ms2', type: 'missile', size: 'medium', center: 80, arc: 55, x: 17, y: 8 }
      ]
    },
    battleship: {
      id: 'battleship', name: '遗渊级战列舰', cls: '战列舰', ico: '🛡️',
      hull: 12500, armor: 1050, maxSpeed: 46, accel: 60, turnRate: 21, rev: 0.45, strafe: 0.22,
      heatCap: 5200, heatDiss: 460, op: 240,
      len: 130, beam: 44, radius: 56, draft: 4, // 吃水：最深（深水鱼雷的主目标）
      desc: '源自联邦远古遗迹的巨舰，装甲厚重如海渊。',
      slots: [
        { id: 'fx1', type: 'fixed', size: 'large', center: 0, arc: 5, x: 0, y: 62 },
        { id: 'sm1', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: 52 },
        { id: 'sm2', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: -56 },
        { id: 'sm3', type: 'turret', size: 'small', center: 100, arc: 130, x: 17, y: 30 },
        { id: 'sm4', type: 'turret', size: 'small', center: -100, arc: 130, x: -17, y: 30 },
        { id: 'sm5', type: 'turret', size: 'small', center: 80, arc: 130, x: 17, y: -30 },
        { id: 'sm6', type: 'turret', size: 'small', center: -80, arc: 130, x: -17, y: -30 },
        { id: 'md1', type: 'turret', size: 'medium', center: 0, arc: 210, x: 0, y: 40 },
        { id: 'md2', type: 'turret', size: 'medium', center: 90, arc: 150, x: 19, y: 4 },
        { id: 'md3', type: 'turret', size: 'medium', center: -90, arc: 150, x: -19, y: 4 },
        { id: 'md4', type: 'turret', size: 'medium', center: 180, arc: 210, x: 0, y: -40 },
        { id: 'lg1', type: 'turret', size: 'large', center: 0, arc: 250, x: 0, y: 16 },
        { id: 'lg2', type: 'turret', size: 'large', center: 180, arc: 250, x: 0, y: -16 },
        { id: 'lg3', type: 'turret', size: 'large', center: 70, arc: 140, x: 23, y: -12 },
        { id: 'lg4', type: 'turret', size: 'large', center: -70, arc: 140, x: -23, y: -12 },
        { id: 'ms1', type: 'missile', size: 'large', center: 15, arc: 45, x: 12, y: 50 },
        { id: 'ms2', type: 'missile', size: 'large', center: -15, arc: 45, x: -12, y: 50 }
      ]
    },

    /* ---- 异形舰体（科幻构型，动力充足力大砖飞） ---- */
    catamaran: {
      id: 'catamaran', name: '双舟级双体舰', cls: '双体舰', ico: '🛶', shape: 'cat',
      hull: 4600, armor: 300, maxSpeed: 96, accel: 130, turnRate: 46, rev: 0.58, strafe: 0.5,
      heatCap: 2700, heatDiss: 250, op: 120,
      len: 88, beam: 40, radius: 35, draft: 1, // 吃水：极浅（双体船特性）
      desc: '双体船身分割浪阻，横推性能出色，机动灵活。',
      slots: [
        { id: 'fx1', type: 'fixed', size: 'medium', center: 0, arc: 7, x: 0, y: 40 },
        { id: 'sm1', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: 30 },
        { id: 'sm2', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: -30 },
        { id: 'md1', type: 'turret', size: 'medium', center: -90, arc: 160, x: -16, y: -6 },
        { id: 'md2', type: 'turret', size: 'medium', center: 90, arc: 160, x: 16, y: -6 },
        { id: 'md3', type: 'turret', size: 'medium', center: 0, arc: 260, x: 0, y: 10 },
        { id: 'ms1', type: 'missile', size: 'small', center: 0, arc: 30, x: 0, y: 38 },
        { id: 'ms2', type: 'missile', size: 'small', center: 180, arc: 70, x: 0, y: -36 }
      ]
    },
    hammer: {
      id: 'hammer', name: '巨锤级锤头舰', cls: '锤头舰', ico: '⚓', shape: 'T',
      hull: 7800, armor: 640, maxSpeed: 62, accel: 82, turnRate: 28, rev: 0.48, strafe: 0.28,
      heatCap: 3800, heatDiss: 330, op: 170,
      len: 92, beam: 46, radius: 43, draft: 2, // 吃水：中
      desc: '宽阔舰艏如巨锤横扫，正面火力密度惊人。',
      slots: [
        { id: 'fx1', type: 'fixed', size: 'large', center: 0, arc: 8, x: 0, y: -44 },
        { id: 'sm1', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: -36 },
        { id: 'sm2', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: -6 },
        { id: 'md1', type: 'turret', size: 'medium', center: -25, arc: 150, x: -16, y: -30 },
        { id: 'md2', type: 'turret', size: 'medium', center: 25, arc: 150, x: 16, y: -30 },
        { id: 'md3', type: 'turret', size: 'medium', center: -155, arc: 150, x: -14, y: -6 },
        { id: 'md4', type: 'turret', size: 'medium', center: 155, arc: 150, x: 14, y: -6 },
        { id: 'lg1', type: 'turret', size: 'large', center: 0, arc: 300, x: 0, y: -20 },
        { id: 'lg2', type: 'turret', size: 'large', center: 0, arc: 300, x: 0, y: 6 },
        { id: 'ms1', type: 'missile', size: 'medium', center: -90, arc: 50, x: -22, y: -14 },
        { id: 'ms2', type: 'missile', size: 'medium', center: 90, arc: 50, x: 22, y: -14 }
      ]
    },
    cross: {
      id: 'cross', name: '星枢级十字舰', cls: '十字舰', ico: '✚', shape: 'cross',
      hull: 9200, armor: 820, maxSpeed: 54, accel: 70, turnRate: 24, rev: 0.45, strafe: 0.24,
      heatCap: 4400, heatDiss: 400, op: 190,
      len: 110, beam: 48, radius: 50, draft: 3, // 吃水：深
      desc: '四臂十字构型，全方位火力无死角。',
      slots: [
        { id: 'fx1', type: 'fixed', size: 'large', center: 0, arc: 8, x: 0, y: -52 },
        { id: 'sm1', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: -44 },
        { id: 'sm2', type: 'turret', size: 'small', center: 180, arc: 360, x: 0, y: 44 },
        { id: 'sm3', type: 'turret', size: 'small', center: 90, arc: 360, x: 20, y: 0 },
        { id: 'sm4', type: 'turret', size: 'small', center: -90, arc: 360, x: -20, y: 0 },
        { id: 'md1', type: 'turret', size: 'medium', center: 0, arc: 220, x: 0, y: 18 },
        { id: 'md2', type: 'turret', size: 'medium', center: 180, arc: 220, x: 0, y: -18 },
        { id: 'md3', type: 'turret', size: 'medium', center: 90, arc: 140, x: 22, y: 0 },
        { id: 'md4', type: 'turret', size: 'medium', center: -90, arc: 140, x: -22, y: 0 },
        { id: 'lg1', type: 'turret', size: 'large', center: 0, arc: 250, x: 0, y: 0 },
        { id: 'lg2', type: 'turret', size: 'large', center: 0, arc: 250, x: 0, y: -34 },
        { id: 'lg3', type: 'turret', size: 'large', center: 90, arc: 130, x: 16, y: 0 },
        { id: 'lg4', type: 'turret', size: 'large', center: -90, arc: 130, x: -16, y: 0 },
        { id: 'ms1', type: 'missile', size: 'large', center: 90, arc: 45, x: 21, y: 0 },
        { id: 'ms2', type: 'missile', size: 'large', center: -90, arc: 45, x: -21, y: 0 }
      ]
    },
    lship: {
      id: 'lship', name: '折戟级强袭舰', cls: 'L形强袭舰', ico: '🛥', shape: 'L',
      hull: 5400, armor: 430, maxSpeed: 88, accel: 120, turnRate: 40, rev: 0.55, strafe: 0.42,
      heatCap: 3000, heatDiss: 280, op: 130,
      len: 84, beam: 40, radius: 36, draft: 1, // 吃水：浅（突击艇）
      desc: '不对称 L 形甲板，右舷火力臂专司突击。',
      slots: [
        { id: 'fx1', type: 'fixed', size: 'medium', center: 0, arc: 7, x: 10, y: 36 },
        { id: 'sm1', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: 28 },
        { id: 'sm2', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: -28 },
        { id: 'md1', type: 'turret', size: 'medium', center: -90, arc: 150, x: -12, y: 6 },
        { id: 'md2', type: 'turret', size: 'medium', center: 90, arc: 150, x: 16, y: -4 },
        { id: 'md3', type: 'turret', size: 'medium', center: 0, arc: 240, x: 0, y: 14 },
        { id: 'ms1', type: 'missile', size: 'small', center: 10, arc: 40, x: 2, y: 34 },
        { id: 'ms2', type: 'missile', size: 'small', center: 120, arc: 60, x: 20, y: -18 }
      ]
    },
    carrier: {
      id: 'carrier', name: '天舟级轻型航母', cls: '轻型航母', ico: '✈', shape: 'carrier',
      hull: 6800, armor: 480, maxSpeed: 60, accel: 70, turnRate: 22, rev: 0.42, strafe: 0.2,
      heatCap: 3600, heatDiss: 320, op: 180,
      len: 118, beam: 48, radius: 50, draft: 3, // 吃水：深
      desc: '宽阔飞行甲板搭载整备小队，舰炮聊胜于无。',
      slots: [
        { id: 'by1', type: 'bay', size: 'large', center: 0, arc: 0, x: 0, y: 40 },
        { id: 'by2', type: 'bay', size: 'medium', center: 0, arc: 0, x: 0, y: -42 },
        { id: 'sm1', type: 'turret', size: 'small', center: 0, arc: 360, x: 0, y: 18 },
        { id: 'sm2', type: 'turret', size: 'small', center: 180, arc: 360, x: 0, y: -18 },
        { id: 'ms1', type: 'missile', size: 'small', center: 0, arc: 40, x: 0, y: 46 }
      ]
    }
  };

  /* 船体整体放大（像素美术细节需求：更大船体） */
  (function () {
    const HS = 1.2, RS = 1.15;
    for (const hid in D.HULLS) {
      const h = D.HULLS[hid];
      h.len *= HS;
      h.beam *= HS;
      h.radius *= RS;
      for (const s of h.slots) { s.x *= HS; s.y *= HS; }
    }
  })();

  const SIZE_RANK = { small: 0, medium: 1, large: 2 };

  /* ---------------- 武器 ----------------
     kind: 'gun'(弹道炮弹) | 'beam'(光束) | 'torpedo'(鱼雷) | 'missile'(导弹) | 'bolt'(能量弹)
     mount: 'turret' | 'fixed' | 'missile'
     heat: 每发热量 (beam 为 heatPS)
     dmg: 每发伤害 (beam 为 dps)
     refire: 射击间隔(秒)
     range: 射程, projSpeed: 弹速, spread: 散布(度)
     ammo: 弹药数(仅导弹/鱼雷), projHP: 弹体生命(可被拦截)
     burst: 连发数, burstInterval: 连发间隔
     torpMult: 对来袭弹体的伤害倍率 */
  D.WEAPONS = {
    /* --- 小口径 --- */
    gun_ac20: {
      id: 'gun_ac20', name: '20mm「燕群」机关炮', size: 'small', mount: 'turret', kind: 'gun', op: 5,
      dmg: 45, refire: 0.28, heat: 22, range: 470, projSpeed: 780, spread: 7, projHP: 1, torpMult: 1.6,
      desc: '高射速小口径炮，弹幕如归巢燕群。'
    },
    gun_flak: {
      id: 'gun_flak', name: '40mm「织网」近防炮', size: 'small', mount: 'turret', kind: 'gun', dtype: 'frag', op: 7,
      dmg: 32, refire: 0.12, heat: 16, range: 430, projSpeed: 950, spread: 9, projHP: 1, torpMult: 3,
      desc: '专业拦截武器：弹幕织成防护网，对鱼雷/导弹伤害极高。'
    },
    pd_laser: {
      id: 'pd_laser', name: '超导近防光束', size: 'small', mount: 'turret', kind: 'beam', op: 6,
      dmg: 26, heatPS: 36, range: 300, torpMult: 2.5,
      desc: '超导结晶供能，精确灼烧来袭鱼雷与导弹。'
    },
    bow_76: {
      id: 'bow_76', name: '76mm「潮歌」舰首炮', size: 'small', mount: 'fixed', kind: 'gun', dtype: 'he', op: 5,
      dmg: 135, refire: 1.8, heat: 75, range: 720, projSpeed: 700, spread: 0.6, projHP: 1, blast: 20,
      desc: '固定安装于船艏，射界狭窄但弹道精准，装填高爆弹。'
    },
    torp_533: {
      id: 'torp_533', name: '533mm「暗流」鱼雷', size: 'small', mount: 'missile', kind: 'torpedo', op: 8,
      dmg: 650, refire: 6.5, heat: 45, range: 900, projSpeed: 260, spread: 1.5, ammo: 5, projHP: 120,
      depth: 1, blast: 95, pen: 0.5, // 直击穿透 50%：一半伤害绕过护盾
      desc: '浅潜直航鱼雷，如暗流般悄无声息；近炸引信覆盖 95px。'
    },
    asm_small: {
      id: 'asm_small', name: '「信天翁」近程导弹', size: 'small', mount: 'missile', kind: 'missile', op: 6,
      dmg: 150, refire: 1.6, heat: 35, range: 760, projSpeed: 640, spread: 2, ammo: 10, projHP: 30, turn: 100,
      blast: 50, pen: 0.35, // 直击穿透 35%
      desc: '自动追踪目标的小型导弹，可被近防炮拦截；近炸引信覆盖 50px。'
    },
    /* --- 中口径 --- */
    gun_ac76: {
      id: 'gun_ac76', name: '76mm「雨燕」速射炮', size: 'medium', mount: 'turret', kind: 'gun', op: 11,
      dmg: 105, refire: 0.5, heat: 60, range: 620, projSpeed: 820, spread: 4, projHP: 1,
      desc: '兼顾射速与威力的通用舰炮。'
    },
    gun_130: {
      id: 'gun_130', name: '130mm「潮汐」舰炮', size: 'medium', mount: 'turret', kind: 'gun', op: 12,
      dmg: 190, refire: 1.7, heat: 115, range: 780, projSpeed: 660, spread: 2.2, projHP: 1,
      desc: '标准中口径主炮，装填平稳、弹道可靠。'
    },
    gun_130x2: {
      id: 'gun_130x2', name: '双联装130mm「潮汐」舰炮', size: 'medium', mount: 'turret', kind: 'gun', op: 14,
      dmg: 140, burst: 2, burstInterval: 0.14, refire: 2.3, heat: 85, range: 800, projSpeed: 660, spread: 2.6, projHP: 1,
      desc: '两发点射的中型炮塔，输出不俗。'
    },
    beam_med: {
      id: 'beam_med', name: '中型超导光束', size: 'medium', mount: 'turret', kind: 'beam', op: 13,
      dmg: 95, heatPS: 115, range: 600, torpMult: 1.2,
      desc: '超导结晶聚焦的持续光束，无视弹道延迟。'
    },
    blaster_med: {
      id: 'blaster_med', name: '中型冷凝粒子炮', size: 'medium', mount: 'turret', kind: 'bolt', op: 14,
      dmg: 250, refire: 2.1, heat: 160, range: 700, projSpeed: 920, spread: 1, projHP: 1,
      desc: '深海冷凝核心供能的粒子团，射速慢但单发威力大。'
    },
    bow_152: {
      id: 'bow_152', name: '152mm「重锤」舰首炮', size: 'medium', mount: 'fixed', kind: 'gun', dtype: 'he', op: 12,
      dmg: 310, refire: 3.1, heat: 190, range: 900, projSpeed: 640, spread: 0.5, projHP: 1, blast: 30,
      desc: '船艏重炮，用于追击与迎头对射，高爆弹头专撕装甲。'
    },
    torp_610: {
      id: 'torp_610', name: '610mm「深潜」重型鱼雷', size: 'medium', mount: 'missile', kind: 'torpedo', op: 12,
      dmg: 1050, refire: 7.5, heat: 70, range: 1000, projSpeed: 240, spread: 1.5, ammo: 4, projHP: 180,
      depth: 2, blast: 120, pen: 0.55, // 直击穿透 55%
      desc: '大装药深潜鱼雷：吃水不足 2 的小艇免疫；近炸引信覆盖 120px。'
    },
    asm_med: {
      id: 'asm_med', name: '「巡天」反舰导弹', size: 'medium', mount: 'missile', kind: 'missile', op: 10,
      dmg: 320, refire: 2.2, heat: 55, range: 980, projSpeed: 520, spread: 2, ammo: 8, projHP: 45, turn: 85,
      blast: 70, pen: 0.4, // 直击穿透 40%
      desc: '标准「巡天」反舰导弹，自动追踪、末段突防；近炸引信覆盖 70px。'
    },
    /* --- 大口径 --- */
    gun_203: {
      id: 'gun_203', name: '203mm星核合金主炮', size: 'large', mount: 'turret', kind: 'gun', op: 22,
      dmg: 420, refire: 3.0, heat: 250, range: 940, projSpeed: 580, spread: 1.4, projHP: 1,
      desc: '突击巡洋舰的中坚火力。'
    },
    gun_305x2: {
      id: 'gun_305x2', name: '双联装305mm星核主炮', size: 'large', mount: 'turret', kind: 'gun', op: 30,
      dmg: 350, burst: 2, burstInterval: 0.25, refire: 4.6, heat: 200, range: 1030, projSpeed: 530, spread: 1.1, projHP: 1,
      desc: '战列舰主炮塔，齐射声震海域。'
    },
    beam_large: {
      id: 'beam_large', name: '大型超导光束', size: 'large', mount: 'turret', kind: 'beam', op: 24,
      dmg: 230, heatPS: 270, range: 730, torpMult: 1.5,
      desc: '毁灭性的能量洪流，需要强大的散热支撑。'
    },
    blaster_large: {
      id: 'blaster_large', name: '大型冷凝粒子炮', size: 'large', mount: 'turret', kind: 'bolt', op: 26,
      dmg: 520, refire: 3.4, heat: 320, range: 780, projSpeed: 980, spread: 0.8, projHP: 1,
      desc: '重型能量武器，单发可洞穿大部分装甲。'
    },
    bow_350: {
      id: 'bow_350', name: '350mm「利维坦」舰首重炮', size: 'large', mount: 'fixed', kind: 'gun', dtype: 'he', op: 24,
      dmg: 800, refire: 6.5, heat: 450, range: 1200, projSpeed: 600, spread: 0.4, projHP: 1, blast: 45,
      desc: '超远程重炮，只能朝船艏方向射击，高爆弹毁天灭地。'
    },
    torp_800: {
      id: 'torp_800', name: '800mm「深渊」超重型鱼雷', size: 'large', mount: 'missile', kind: 'torpedo', op: 20,
      dmg: 1900, refire: 9, heat: 100, range: 1100, projSpeed: 210, spread: 1.5, ammo: 3, projHP: 280,
      depth: 3, blast: 150, pen: 0.6, // 直击穿透 60%
      desc: '深水重锤：吃水不足 3 的舰船无法触发；近炸引信覆盖 150px。'
    },
    asm_large: {
      id: 'asm_large', name: '「天坠」重型导弹', size: 'large', mount: 'missile', kind: 'missile', op: 16,
      dmg: 850, refire: 3.5, heat: 85, range: 1050, projSpeed: 430, spread: 1.5, ammo: 4, projHP: 60, turn: 65,
      blast: 95, pen: 0.45, // 直击穿透 45%
      desc: '大型巡航导弹，弹体坚固、威力巨大；近炸引信覆盖 95px。'
    },
    /* --- 占位型武器（廉价「树枝」：OP 极少、绝对性能差，但每 OP 性价比极高） --- */
    gun_plink: {
      id: 'gun_plink', name: '铁管喷枪', size: 'small', mount: 'turret', kind: 'gun', dtype: 'kin', op: 2,
      dmg: 16, refire: 0.08, heat: 7, range: 240, projSpeed: 680, spread: 16, projHP: 1,
      desc: '废弃铁管焊成的小炮，射程近得可笑，但便宜到离谱。'
    },
    gun_nail: {
      id: 'gun_nail', name: '船厂铆钉枪', size: 'small', mount: 'turret', kind: 'gun', dtype: 'frag', op: 1,
      dmg: 11, refire: 0.07, heat: 5, range: 190, projSpeed: 560, spread: 18, projHP: 1,
      desc: '把船厂铆钉整排打出去的简易武器，糊脸还行。'
    },
    gun_hoe: {
      id: 'gun_hoe', name: '农用掷弹筒', size: 'small', mount: 'turret', kind: 'gun', dtype: 'he', op: 3,
      dmg: 75, refire: 1.8, heat: 30, range: 340, projSpeed: 500, spread: 12, projHP: 1, blast: 22,
      desc: '渔民驱鲨用的高爆弹塞进铁管，炸就完事了。'
    },
    /* --- 单槽位高级武器（性价比低，但吃满槽位潜力） --- */
    beam_annih: {
      id: 'beam_annih', name: '湮灭者长矛', size: 'large', mount: 'turret', kind: 'beam', dtype: 'beam', op: 48, rarity: 'legendary',
      dmg: 420, heatPS: 540, range: 880, torpMult: 1.4,
      desc: '帝国退役的旗舰级光束武器，耗能恐怖，输出同样恐怖。'
    },
    gun_apoc: {
      id: 'gun_apoc', name: '星核粉碎炮', size: 'large', mount: 'turret', kind: 'gun', dtype: 'he', op: 36, rarity: 'legendary',
      dmg: 640, refire: 4.6, heat: 380, range: 800, projSpeed: 560, spread: 1, projHP: 1, blast: 55,
      desc: '星核合金弹头，一发凿穿半个船体，代价是装填慢如蜗牛。'
    },
    torp_hel: {
      id: 'torp_hel', name: '螺旋穿甲鱼雷', size: 'large', mount: 'missile', kind: 'torpedo', dtype: 'he', op: 26, rarity: 'legendary',
      dmg: 2200, refire: 10, heat: 120, range: 1000, projSpeed: 250, spread: 1, ammo: 2, projHP: 340,
      depth: 3, blast: 160, pen: 0.55, // 直击穿透 55%
      desc: '深水穿甲弹头：吃水不足 3 免疫；近炸引信覆盖 160px，专打重甲目标。'
    },
    /* --- 高爆炮塔矩阵补齐 --- */
    gun_how: {
      id: 'gun_how', name: '高爆榴弹炮', size: 'medium', mount: 'turret', kind: 'gun', dtype: 'he', op: 12,
      dmg: 230, refire: 2.3, heat: 130, range: 610, projSpeed: 580, spread: 3.5, projHP: 1, blast: 32,
      desc: '曲射高爆弹，专治重甲目标。'
    },
    gun_mortar: {
      id: 'gun_mortar', name: '高爆迫击炮', size: 'large', mount: 'turret', kind: 'gun', dtype: 'he', op: 21,
      dmg: 540, refire: 4.0, heat: 300, range: 760, projSpeed: 460, spread: 4.5, projHP: 1, blast: 42,
      desc: '重型迫击炮，弹道弯曲但威力十足。'
    },
    gun_shred: {
      id: 'gun_shred', name: '破片霰弹炮', size: 'medium', mount: 'turret', kind: 'gun', dtype: 'frag', op: 9,
      dmg: 36, refire: 0.14, heat: 20, range: 330, projSpeed: 700, spread: 14, projHP: 1,
      desc: '近距离破片风暴，对付剥了甲的船体效果拔群。'
    },
    /* --- 载机（装配进机库位 bay；以小队行动，由母舰整备系统管理） --- */
    fgt_interceptor: {
      id: 'fgt_interceptor', name: '燕隼拦截机', size: 'medium', mount: 'bay', kind: 'fighter', op: 14,
      squad: 4, hp: 110, speed: 310, turn: 5.0, dmg: 34, refire: 0.4, range: 440, ammo: 56, prepCost: 22,
      desc: '高速拦截机小队：机动性强，专打敌方载机与轻型目标；战损补充消耗 22 整备。'
    },
    fgt_escort: {
      id: 'fgt_escort', name: '海鸥护航机', size: 'medium', mount: 'bay', kind: 'fighter', op: 16,
      squad: 3, hp: 200, speed: 265, turn: 4.0, dmg: 46, refire: 0.7, range: 390, ammo: 40, prepCost: 28,
      desc: '皮实的护航机小队：耐久高，适合缠斗消耗；战损补充消耗 28 整备。'
    },
    fgt_bomber: {
      id: 'fgt_bomber', name: '信天轰炸机', size: 'large', mount: 'bay', kind: 'fighter', op: 20,
      squad: 3, hp: 165, speed: 225, turn: 3.0, dmg: 180, refire: 2.8, range: 400, ammo: 8, prepCost: 34,
      desc: '挂载重型航弹的轰炸机小队：每轮攻击都是高额直击；战损补充消耗 34 整备。'
    }
  };

  /* ---------------- 舰船插件 ----------------
     effects: armor/speed/turn/diss/cap/range/accel/ammo 乘数, repair 每秒维修, flak 拦截倍率 */
  D.HULLMODS = {
    hm_armor: { id: 'hm_armor', name: '潮纹木装甲带', op: 10, effects: { armor: 1.3, speed: 0.94 }, desc: '装甲 +30%，最大航速 -6%（蜂窝结构潮纹木）。' },
    hm_engine: { id: 'hm_engine', name: '双轴大功率轮机', op: 8, effects: { speed: 1.12 }, desc: '最大航速 +12%。' },
    hm_accel: { id: 'hm_accel', name: '过载推进器', op: 6, effects: { accel: 1.35 }, desc: '加速能力 +35%，起停更快。' },
    hm_rudder: { id: 'hm_rudder', name: '精校舵机', op: 6, effects: { turn: 1.3 }, desc: '转向速度 +30%。' },
    hm_cool: { id: 'hm_cool', name: '冷凝循环回路', op: 12, effects: { diss: 1.3 }, desc: '散热能力 +30%。' },
    hm_sink: { id: 'hm_sink', name: '扩容热阱', op: 10, effects: { cap: 1.25 }, desc: '热容上限 +25%。' },
    hm_fcs: { id: 'hm_fcs', name: '战术AI火控', op: 14, effects: { range: 1.15 }, desc: '所有武器射程 +15%。' },
    hm_ammo: { id: 'hm_ammo', name: '弹药储备库', op: 10, effects: { ammo: 1.5 }, desc: '导弹/鱼雷备弹 +50%。' },
    hm_dc: { id: 'hm_dc', name: '损管班组', op: 8, effects: { repair: 8 }, desc: '脱离战斗后每秒维修 8 点船体。' },
    hm_flak: { id: 'hm_flak', name: '近防指挥仪', op: 6, effects: { flak: 1.5 }, desc: '所有武器对来袭鱼雷/导弹伤害 +50%。' },
    hm_shield: { id: 'hm_shield', name: '损管护盾增效器', op: 18, effects: { coef: 0.2 }, desc: '护盾效率 +20%（热量折算系数 -0.2），贵重改装。' }
  };

  /* ---------------- 预设装配（僚舰 / 敌军 / 默认旗舰） ---------------- */
  D.PRESETS = {
    dd_gun: {
      name: '侦察艇·炮击型',
      hullId: 'destroyer',
      weapons: { fx1: 'bow_76', sm1: 'gun_ac20', sm2: 'gun_ac20', ms1: 'torp_533', ms2: 'asm_small' },
      hullmods: ['hm_engine']
    },
    dd_torp: {
      name: '侦察艇·雷击型',
      hullId: 'destroyer',
      weapons: { fx1: 'bow_76', sm1: 'gun_flak', sm2: 'gun_flak', ms1: 'torp_533', ms2: 'torp_533' },
      hullmods: ['hm_accel']
    },
    cl_std: {
      name: '护卫舰·标准型',
      hullId: 'lightCruiser',
      weapons: { fx1: 'bow_152', sm1: 'gun_flak', sm2: 'gun_flak', md1: 'gun_130', md2: 'gun_130', md3: 'gun_ac76', ms1: 'torp_533', ms2: 'asm_small' },
      hullmods: ['hm_engine', 'hm_fcs']
    },
    cl_beam: {
      name: '护卫舰·光束型',
      hullId: 'lightCruiser',
      weapons: { fx1: 'bow_152', sm1: 'pd_laser', sm2: 'pd_laser', md1: 'beam_med', md2: 'beam_med', md3: 'blaster_med', ms1: 'torp_533', ms2: 'asm_small' },
      hullmods: ['hm_cool']
    },
    ca_std: {
      name: '突击巡洋舰·标准型',
      hullId: 'heavyCruiser',
      weapons: { fx1: 'bow_350', sm1: 'gun_flak', sm2: 'gun_flak', md1: 'gun_130x2', md2: 'gun_130x2', lg1: 'gun_305x2', ms1: 'torp_610', ms2: 'asm_med' },
      hullmods: ['hm_armor']
    },
    bb_std: {
      name: '战列舰·标准型',
      hullId: 'battleship',
      weapons: { fx1: 'bow_350', sm1: 'gun_flak', sm2: 'gun_flak', sm3: 'gun_flak', sm4: 'gun_flak', md1: 'gun_130x2', md2: 'gun_130x2', lg1: 'gun_305x2', lg2: 'gun_305x2', lg4: 'beam_large', ms1: 'torp_800', ms2: 'asm_large' },
      hullmods: ['hm_armor', 'hm_ammo']
    }
  };

  /* 玩家各舰体的默认改装 */
  D.DEFAULT_LOADS = {
    destroyer: {
      hullId: 'destroyer', name: '浮沫-01',
      weapons: { fx1: 'bow_76', sm1: 'gun_ac20', sm2: 'gun_flak', ms1: 'torp_533', ms2: 'asm_small' },
      hullmods: ['hm_engine', 'hm_rudder']
    },
    lightCruiser: {
      hullId: 'lightCruiser', name: '潮纹-01',
      weapons: { fx1: 'bow_152', sm1: 'gun_ac20', sm2: 'gun_flak', md1: 'gun_130', md2: 'gun_130', md3: 'gun_ac76', ms1: 'torp_533', ms2: 'asm_small' },
      hullmods: ['hm_engine', 'hm_fcs']
    },
    heavyCruiser: {
      hullId: 'heavyCruiser', name: '破冰-01',
      weapons: { fx1: 'bow_350', sm1: 'gun_flak', sm2: 'gun_flak', md1: 'gun_130x2', md2: 'gun_130x2', lg1: 'gun_305x2', lg2: 'gun_203', ms1: 'torp_610', ms2: 'asm_med' },
      hullmods: ['hm_armor']
    },
    battleship: {
      hullId: 'battleship', name: '遗渊-01',
      weapons: { fx1: 'bow_350', sm1: 'gun_flak', sm2: 'gun_flak', sm3: 'gun_flak', sm4: 'gun_flak', md1: 'gun_130x2', md2: 'gun_130x2', md3: 'beam_med', md4: 'blaster_med', lg1: 'gun_305x2', lg2: 'gun_305x2', lg4: 'beam_large', ms1: 'torp_800', ms2: 'asm_large' },
      hullmods: ['hm_armor']
    },
    catamaran: {
      hullId: 'catamaran', name: '双舟-01',
      weapons: { fx1: 'bow_152', sm1: 'gun_ac20', sm2: 'gun_flak', md1: 'gun_130', md2: 'gun_130', md3: 'gun_ac76', ms1: 'torp_533', ms2: 'asm_small' },
      hullmods: ['hm_engine', 'hm_rudder']
    },
    hammer: {
      hullId: 'hammer', name: '巨锤-01',
      weapons: { fx1: 'bow_350', sm1: 'gun_flak', sm2: 'gun_flak', md1: 'gun_130x2', md2: 'gun_130x2', md3: 'gun_130', lg1: 'gun_305x2', lg2: 'gun_203', ms1: 'torp_610', ms2: 'asm_med' },
      hullmods: ['hm_armor']
    },
    cross: {
      hullId: 'cross', name: '星枢-01',
      weapons: { fx1: 'bow_350', sm1: 'gun_flak', sm2: 'gun_flak', sm3: 'gun_flak', sm4: 'gun_flak', md1: 'gun_130x2', md2: 'gun_130x2', lg1: 'gun_305x2', lg3: 'blaster_large', ms1: 'torp_800', ms2: 'asm_large' },
      hullmods: ['hm_cool']
    },
    lship: {
      hullId: 'lship', name: '折戟-01',
      weapons: { fx1: 'bow_152', sm1: 'gun_ac20', sm2: 'gun_flak', md1: 'gun_130', md2: 'gun_ac76', md3: 'gun_130x2', ms1: 'torp_533', ms2: 'asm_small' },
      hullmods: ['hm_engine', 'hm_fcs']
    },
    carrier: {
      hullId: 'carrier', name: '天舟-01',
      weapons: { by1: 'fgt_bomber', by2: 'fgt_interceptor', sm1: 'gun_ac20', sm2: 'gun_flak', ms1: 'asm_small' },
      hullmods: ['hm_engine']
    }
  };

  /* ---------------- 敌方舰队（难度） ---------------- */
  D.DIFFICULTIES = {
    patrol: {
      id: 'patrol', name: '巡逻遭遇', desc: '督府巡逻编队 · 敌军反应迟缓',
      enemy: ['dd_gun', 'dd_torp', 'cl_std'],
      skill: { react: 0.62, aimErr: 0.15, interval: 0.5, targetDelay: 1.2, dodge: 0.3 }
    },
    skirmish: {
      id: 'skirmish', name: '常规遭遇战', desc: '混编遭遇舰队 · 敌军反应接近人类',
      enemy: ['dd_gun', 'dd_torp', 'cl_std', 'cl_beam'],
      skill: { react: 0.44, aimErr: 0.1, interval: 0.36, targetDelay: 0.85, dodge: 0.62 }
    },
    fleet: {
      id: 'fleet', name: '舰队决战', desc: '军阀冰封舰队 · 精锐敌军',
      enemy: ['ca_std', 'cl_std', 'cl_beam', 'dd_gun', 'dd_torp'],
      skill: { react: 0.32, aimErr: 0.075, interval: 0.28, targetDelay: 0.65, dodge: 0.8 }
    }
  };

  /* 友军 AI 参数（略强于敌军，但仍符合人类反应速度） */
  D.ALLY_SKILL = { react: 0.26, aimErr: 0.045, interval: 0.2, targetDelay: 0.45, dodge: 0.88 };

  /* 僚舰可选列表 */
  D.ALLY_OPTIONS = [
    { id: 'dd_gun', name: '侦察艇·炮击型', sub: '灵活 · 鱼雷+机关炮' },
    { id: 'dd_torp', name: '侦察艇·雷击型', sub: '双鱼雷管 · 高速突击' },
    { id: 'cl_std', name: '护卫舰·标准型', sub: '均衡 · 中口径齐射' },
    { id: 'cl_beam', name: '护卫舰·光束型', sub: '光束输出 · 精确打击' },
    { id: 'ca_std', name: '突击巡洋舰·标准型', sub: '重甲重炮 · 缓慢但坚实' }
  ];

  /* 舰名池 */
  D.NAMES = {
    ally: ['白鲸', '蓝鳍', '信风', '珊瑚', '珍珠', '长鲸', '灯塔', '晨雾', '海星', '银鸥'],
    enemy: ['赤鲨', '黑潮', '火镰', '鬼头', '铁锚', '毒水母', '鬣狗', '夜枭', '断浪', '风暴角']
  };

  /* ---------------- 装配辅助 ---------------- */

  /** 由武器表 + 插件构造装配（自动生成分组：
      g1 主炮(中/大口径火炮、光束、粒子炮) / g2 副炮近防(小口径) / g3 导弹鱼雷）
      opts.player = true 时 g3 默认手动开火 */
  D.buildLoadout = function (hullId, weapons, hullmods, opts) {
    opts = opts || {};
    const groups = { 1: { auto: true, weapons: [] }, 2: { auto: true, weapons: [] }, 3: { auto: !opts.player, weapons: [] }, 4: { auto: false, weapons: [] }, 5: { auto: false, weapons: [] } };
    for (const slotId in weapons) {
      const w = D.WEAPONS[weapons[slotId]];
      let g = 3;
      if (w.mount !== 'missile') {
        g = w.size === 'small' ? 2 : 1;
      }
      groups[g].weapons.push(slotId);
    }
    return {
      hullId: hullId,
      name: D.HULLS[hullId].name,
      weapons: Object.assign({}, weapons),
      hullmods: hullmods.slice(),
      groups: groups
    };
  };

  /** 校验一个装配是否合法（OP 不超、武器匹配槽位、分组完备） */
  D.validateLoadout = function (loadout) {
    const hull = D.HULLS[loadout.hullId];
    if (!hull) return { ok: false, msg: '未知舰体' };
    let op = 0;
    const usedSlots = {};
    for (const slotId in loadout.weapons) {
      const slot = hull.slots.find(s => s.id === slotId);
      const w = D.WEAPONS[loadout.weapons[slotId]];
      if (!slot || !w) return { ok: false, msg: '装配引用了不存在的槽位或武器' };
      if (SIZE_RANK[w.size] > SIZE_RANK[slot.size]) return { ok: false, msg: w.name + ' 无法装入 ' + slot.size + ' 槽位' };
      if (w.mount !== slot.type) return { ok: false, msg: w.name + ' 与槽位类型不符' };
      op += w.op;
      usedSlots[slotId] = true;
    }
    for (const hmId of loadout.hullmods) {
      const hm = D.HULLMODS[hmId];
      if (!hm) return { ok: false, msg: '未知插件' };
      op += hm.op;
    }
    // 分组完备性：每个已装备武器必须恰好在一个组（旧存档无分组时跳过）
    const groups = loadout.groups || null;
    const seen = {};
    if (groups) {
      for (let g = 1; g <= 5; g++) {
        const group = groups[g];
        if (!group) continue;
        for (const sid of group.weapons) {
          if (!loadout.weapons[sid]) return { ok: false, msg: '分组包含未装备的武器' };
          if (seen[sid]) return { ok: false, msg: '武器被分配到多个组' };
          seen[sid] = true;
        }
      }
      for (const sid in loadout.weapons) {
        if (!seen[sid]) return { ok: false, msg: '有武器未分配分组' };
      }
    }
    return { ok: true, op: op, opMax: hull.op };
  };

  /* OP 调校：剩余 OP 可直接投入散热/热容/损管护盾效率，不让 OP 浪费 */
  D.OP_TUNE = {
    diss: { label: '冷凝循环', cost: 5, per: 8, max: 6, desc: '每级 +8 散热/秒（5 OP）' },
    cap: { label: '热阱扩容', cost: 4, per: 120, max: 6, desc: '每级 +120 热容（4 OP）' },
    dc: { label: '损管护盾', cost: 6, per: 0.08, max: 5, desc: '护盾效率：每级热量折算 -8%（默认系数 1.0，越低护盾越高效）' }
  };

  /** 装备某武器后的 OP 合计（含 OP 调校） */
  D.loadoutOP = function (loadout) {
    let op = 0;
    for (const slotId in loadout.weapons) {
      const w = D.WEAPONS[loadout.weapons[slotId]];
      if (w) op += w.op;
    }
    for (const hmId of loadout.hullmods) {
      const hm = D.HULLMODS[hmId];
      if (hm) op += hm.op;
    }
    const t = loadout.opTuning || {};
    op += (t.diss || 0) * D.OP_TUNE.diss.cost;
    op += (t.cap || 0) * D.OP_TUNE.cap.cost;
    op += (t.dc || 0) * D.OP_TUNE.dc.cost;
    return op;
  };

  /** 计算舰体最终属性（基础 + 插件乘数 + OP 调校） */
  D.finalStats = function (hullId, hullmods, opTuning) {
    const h = D.HULLS[hullId];
    let armor = 1, speed = 1, turn = 1, diss = 1, cap = 1, range = 1, accel = 1, ammo = 1, repair = 0, flak = 1;
    for (const id of hullmods) {
      const hm = D.HULLMODS[id];
      if (!hm || !hm.effects) continue;
      const e = hm.effects;
      if (e.armor) armor *= e.armor;
      if (e.speed) speed *= e.speed;
      if (e.turn) turn *= e.turn;
      if (e.diss) diss *= e.diss;
      if (e.cap) cap *= e.cap;
      if (e.range) range *= e.range;
      if (e.accel) accel *= e.accel;
      if (e.ammo) ammo *= e.ammo;
      if (e.repair) repair += e.repair;
      if (e.flak) flak *= e.flak;
    }
    const t = opTuning || {};
    // 损管护盾系数：默认 1.0；OP 调校每级 -per；贵重插件可再减
    let shieldCoef = 1.0 - (t.dc || 0) * D.OP_TUNE.dc.per;
    for (const id of hullmods) {
      const hm = D.HULLMODS[id];
      if (hm && hm.effects && hm.effects.coef) shieldCoef -= hm.effects.coef;
    }
    return {
      hull: h.hull, armor: h.armor * armor, maxSpeed: h.maxSpeed * speed,
      accel: h.accel * accel, turnRate: h.turnRate * turn,
      heatCap: h.heatCap * cap + (t.cap || 0) * D.OP_TUNE.cap.per,
      heatDiss: h.heatDiss * diss + (t.diss || 0) * D.OP_TUNE.diss.per,
      rangeMult: range, ammoMult: ammo, repair: repair, flakMult: flak,
      shieldCoef: Math.max(0.5, shieldCoef)
    };
  };

  /* ---------------- 为默认装配生成武器分组 ---------------- */
  for (const hid in D.DEFAULT_LOADS) {
    const raw = D.DEFAULT_LOADS[hid];
    const built = D.buildLoadout(hid, raw.weapons, raw.hullmods, { player: true });
    built.name = raw.name;
    D.DEFAULT_LOADS[hid] = built;
  }

  /* ============================================================
     远征模式（The Bazaar 式 Roguelike）扩展数据
     ============================================================ */
  D.RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3 };
  D.RARITY_LABEL = { common: '普通', rare: '稀有', epic: '史诗', legendary: '传说' };
  D.RARITY_COLOR = { common: '#9db4c8', rare: '#5ab1ff', epic: '#b48cff', legendary: '#ffab45' };

  /* ---------------- 升级芯片（永久强化，可叠加） ---------------- */
  D.UPGRADES = {
    up_op6: { id: 'up_op6', name: '装配工位扩充', rarity: 'rare', value: 90, desc: '最大 OP +6', effects: { op: 6 } },
    up_op10: { id: 'up_op10', name: '大型装配工位扩充', rarity: 'epic', value: 140, desc: '最大 OP +10', effects: { op: 10 } },
    up_hull: { id: 'up_hull', name: '潮纹木补强材', rarity: 'common', value: 60, desc: '最大船体 +15%', effects: { hull: 1.15 } },
    up_armor: { id: 'up_armor', name: '潮纹木装甲板', rarity: 'common', value: 60, desc: '装甲 +20%', effects: { armor: 1.2 } },
    up_speed: { id: 'up_speed', name: '轮机增压器', rarity: 'common', value: 50, desc: '最大航速 +8%', effects: { speed: 1.08 } },
    up_turn: { id: 'up_turn', name: '舵机精校', rarity: 'common', value: 40, desc: '转向 +12%', effects: { turn: 1.12 } },
    up_diss: { id: 'up_diss', name: '冷凝鳍片', rarity: 'rare', value: 70, desc: '散热 +15%', effects: { diss: 1.15 } },
    up_cap: { id: 'up_cap', name: '热阱扩容', rarity: 'rare', value: 70, desc: '热容 +15%', effects: { cap: 1.15 } },
    up_range: { id: 'up_range', name: '火控升级', rarity: 'rare', value: 80, desc: '武器射程 +8%', effects: { range: 1.08 } },
    up_ammo: { id: 'up_ammo', name: '弹药舱扩容', rarity: 'rare', value: 60, desc: '导弹/鱼雷备弹 +30%', effects: { ammo: 1.3 } },
    up_repair: { id: 'up_repair', name: '随舰损管组', rarity: 'rare', value: 70, desc: '脱战后每秒修复 5 船体', effects: { repair: 5 } },
    up_dmg: { id: 'up_dmg', name: '冷凝核心装药', rarity: 'epic', value: 110, desc: '所有武器伤害 +6%', effects: { dmg: 1.06 } },
    up_heat: { id: 'up_heat', name: '冷却炮管', rarity: 'epic', value: 110, desc: '武器产热 -8%', effects: { heat: 0.92 } },
    up_gold: { id: 'up_gold', name: '锚地贸易协定', rarity: 'rare', value: 80, desc: '战斗金币收入 +20%', effects: { gold: 1.2 } }
  };

  /* ---------------- 遗物（占用遗物槽的被动神器） ---------------- */
  D.RELICS = {
    relic_range: { id: 'relic_range', name: '联邦瞭望阵列', rarity: 'rare', value: 70, desc: '所有武器射程 +10%', effects: { range: 1.1 } },
    relic_dmg: { id: 'relic_dmg', name: '老兵教头', rarity: 'rare', value: 80, desc: '所有武器伤害 +8%', effects: { dmg: 1.08 } },
    relic_armor: { id: 'relic_armor', name: '星核合金带', rarity: 'rare', value: 75, desc: '装甲 +15%', effects: { armor: 1.15 } },
    relic_ammo: { id: 'relic_ammo', name: '量产流水线蓝图', rarity: 'rare', value: 65, desc: '导弹/鱼雷备弹 +50%', effects: { ammo: 1.5 } },
    relic_repair: { id: 'relic_repair', name: '损管专家组', rarity: 'epic', value: 100, desc: '脱战后每秒修复 8 船体', effects: { repair: 8 } },
    relic_speed: { id: 'relic_speed', name: '顺流帆', rarity: 'rare', value: 60, desc: '最大航速 +8%', effects: { speed: 1.08 } },
    relic_heat: { id: 'relic_heat', name: '战术AI炮术官', rarity: 'epic', value: 105, desc: '武器产热 -10%', effects: { heat: 0.9 } },
    relic_gold: { id: 'relic_gold', name: '锚地劫掠旗', rarity: 'legendary', value: 150, desc: '战斗金币收入 +30%', effects: { gold: 1.3 } },
    relic_torp: { id: 'relic_torp', name: '防雷浮网', rarity: 'epic', value: 110, desc: '受到鱼雷/导弹伤害 -35%', effects: { torpResist: 0.65 } },
    relic_cargo: { id: 'relic_cargo', name: '扩容货舱', rarity: 'epic', value: 120, desc: '船舱容量 +2', effects: { cargo: 2 } },
    relic_hull: { id: 'relic_hull', name: '潮纹龙骨', rarity: 'epic', value: 110, desc: '最大船体 +20%', effects: { hull: 1.2 } },
    relic_cool: { id: 'relic_cool', name: '深海冷凝机组', rarity: 'rare', value: 75, desc: '散热 +15%', effects: { diss: 1.15 } },
    relic_core: { id: 'relic_core', name: '源核芯片', rarity: 'legendary', value: 220, desc: '遗迹级超级AI：伤害 +12%、产热 -10%、射程 +8%', effects: { dmg: 1.12, heat: 0.9, range: 1.08 } },
    relic_shield: { id: 'relic_shield', name: '护盾核心', rarity: 'epic', value: 180, desc: '护盾效率 +15%（热量折算系数 -0.15）', effects: { coef: 0.15 } }
  };

  /* ---------------- 战斗消耗品 ---------------- */
  D.CONSUMABLES = {
    cons_repair: { id: 'cons_repair', name: '修理工具', rarity: 'common', value: 25, desc: '战斗中立即恢复 30% 船体' },
    cons_coolant: { id: 'cons_coolant', name: '应急冷却剂', rarity: 'common', value: 25, desc: '战斗中立即清空热量' },
    cons_ammo: { id: 'cons_ammo', name: '弹药补给箱', rarity: 'common', value: 30, desc: '战斗中所有导弹/鱼雷 +2 备弹' },
    cons_smoke: { id: 'cons_smoke', name: '烟幕浮标', rarity: 'common', value: 30, desc: '战斗中 6 秒内敌军无法锁定你' }
  };

  /* ---------------- 舰体图纸 ---------------- */
  D.HULL_CARDS = {
    card_destroyer: { id: 'card_destroyer', hullId: 'destroyer', name: '浮沫级侦察艇图纸', rarity: 'common', value: 120, desc: '将旗舰改装为浮沫级侦察艇' },
    card_lightCruiser: { id: 'card_lightCruiser', hullId: 'lightCruiser', name: '潮纹级护卫舰图纸', rarity: 'rare', value: 260, desc: '将旗舰改装为潮纹级护卫舰' },
    card_heavyCruiser: { id: 'card_heavyCruiser', hullId: 'heavyCruiser', name: '破冰级突击巡洋舰图纸', rarity: 'epic', value: 420, desc: '将旗舰改装为破冰级突击巡洋舰' },
    card_battleship: { id: 'card_battleship', hullId: 'battleship', name: '遗渊级战列舰图纸', rarity: 'legendary', value: 680, desc: '将旗舰改装为遗渊级战列舰' },
    card_catamaran: { id: 'card_catamaran', hullId: 'catamaran', name: '双舟级双体舰图纸', rarity: 'rare', value: 300, desc: '将旗舰改装为双舟级双体舰' },
    card_hammer: { id: 'card_hammer', hullId: 'hammer', name: '巨锤级锤头舰图纸', rarity: 'epic', value: 460, desc: '将旗舰改装为巨锤级锤头舰' },
    card_cross: { id: 'card_cross', hullId: 'cross', name: '星枢级十字舰图纸', rarity: 'legendary', value: 700, desc: '将旗舰改装为星枢级十字舰' },
    card_lship: { id: 'card_lship', hullId: 'lship', name: '折戟级强袭舰图纸', rarity: 'epic', value: 340, desc: '将旗舰改装为折戟级强袭舰' },
    card_carrier: { id: 'card_carrier', hullId: 'carrier', name: '天舟级轻型航母图纸', rarity: 'epic', value: 500, desc: '将旗舰改装为天舟级轻型航母（载机整备系统）' }
  };

  /* ---------------- 僚舰卡 ---------------- */
  D.ESCORT_CARDS = {
    escort_dd_gun: { id: 'escort_dd_gun', presetId: 'dd_gun', name: '侦察艇·炮击型', rarity: 'common', value: 90, desc: '僚舰：灵活 · 鱼雷+机关炮' },
    escort_dd_torp: { id: 'escort_dd_torp', presetId: 'dd_torp', name: '侦察艇·雷击型', rarity: 'common', value: 90, desc: '僚舰：双鱼雷管 · 高速突击' },
    escort_cl_std: { id: 'escort_cl_std', presetId: 'cl_std', name: '护卫舰·标准型', rarity: 'rare', value: 180, desc: '僚舰：均衡 · 中口径齐射' },
    escort_cl_beam: { id: 'escort_cl_beam', presetId: 'cl_beam', name: '护卫舰·光束型', rarity: 'rare', value: 180, desc: '僚舰：光束输出 · 精确打击' },
    escort_ca_std: { id: 'escort_ca_std', presetId: 'ca_std', name: '突击巡洋舰·标准型', rarity: 'epic', value: 320, desc: '僚舰：重甲重炮 · 缓慢但坚实' },
    escort_bb_std: { id: 'escort_bb_std', presetId: 'bb_std', name: '战列舰·标准型', rarity: 'legendary', value: 520, desc: '僚舰：海上堡垒' }
  };

  /* ---------------- 物品构造与稀有度 ---------------- */
  D.ITEM_ICON = { weapon: '⚔', hullmod: '🔧', relic: '🏺', upgrade: '⬆', consumable: '🧰', escort: '🚢', hull: '🛳' };

  /* 占位型廉价武器（树枝）：商人清仓货架常驻 */
  D.CHEAP_WEAPONS = ['gun_plink', 'gun_nail', 'gun_hoe'];

  /** 武器伤害类型兜底（未显式标注时按武器类别推断：炮=动能、光束/能量=光束、鱼雷/导弹=高爆） */
  D.dtypeOf = function (w) {
    return w.dtype || { gun: 'kin', beam: 'beam', bolt: 'beam', torpedo: 'he', missile: 'he' }[w.kind] || 'kin';
  };

  /** 航速显示换算：像素/秒 → 节（现实舰船航速量级：侦察艇 ~34 节、战列舰 ~19 节） */
  D.knots = function (pxs) { return Math.round(10 + pxs * 0.2); };

  D.makeItem = function (type, id) {
    if (type === 'weapon') {
      const d = D.WEAPONS[id];
      if (!d) return null;
      return { type, id, rarity: d.rarity || (d.size === 'large' ? 'epic' : (d.size === 'medium' ? 'rare' : 'common')), value: d.op * 9, def: d };
    }
    if (type === 'hullmod') {
      const d = D.HULLMODS[id];
      if (!d) return null;
      return { type, id, rarity: d.op >= 12 ? 'rare' : 'common', value: d.op * 9, def: d };
    }
    if (type === 'relic') { const d = D.RELICS[id]; return d ? { type, id, rarity: d.rarity, value: d.value, def: d } : null; }
    if (type === 'upgrade') { const d = D.UPGRADES[id]; return d ? { type, id, rarity: d.rarity, value: d.value, def: d } : null; }
    if (type === 'consumable') { const d = D.CONSUMABLES[id]; return d ? { type, id, rarity: d.rarity, value: d.value, def: d } : null; }
    if (type === 'escort') { const d = D.ESCORT_CARDS[id]; return d ? { type, id, rarity: d.rarity, value: d.value, def: d } : null; }
    if (type === 'hull') { const d = D.HULL_CARDS[id]; return d ? { type, id, rarity: d.rarity, value: d.value, def: d } : null; }
    return null;
  };

  D.ITEM_POOLS = {
    common: [
      'weapon:gun_ac20', 'weapon:gun_flak', 'weapon:pd_laser', 'weapon:bow_76', 'weapon:torp_533', 'weapon:asm_small',
      'weapon:gun_plink', 'weapon:gun_nail', 'weapon:gun_hoe',
      'hullmod:hm_accel', 'hullmod:hm_rudder', 'hullmod:hm_engine',
      'upgrade:up_hull', 'upgrade:up_armor', 'upgrade:up_speed', 'upgrade:up_turn',
      'consumable:cons_repair', 'consumable:cons_coolant', 'consumable:cons_ammo', 'consumable:cons_smoke',
      'escort:escort_dd_gun', 'escort:escort_dd_torp', 'hull:card_destroyer'
    ],
    rare: [
      'weapon:gun_ac76', 'weapon:gun_130', 'weapon:gun_130x2', 'weapon:beam_med', 'weapon:blaster_med', 'weapon:bow_152', 'weapon:torp_610', 'weapon:asm_med',
      'weapon:gun_how', 'weapon:gun_shred', 'weapon:fgt_interceptor', 'weapon:fgt_escort',
      'hullmod:hm_armor', 'hullmod:hm_cool', 'hullmod:hm_sink', 'hullmod:hm_fcs', 'hullmod:hm_ammo', 'hullmod:hm_dc', 'hullmod:hm_flak',
      'relic:relic_range', 'relic:relic_dmg', 'relic:relic_armor', 'relic:relic_ammo', 'relic:relic_speed', 'relic:relic_cool',
      'upgrade:up_op6', 'upgrade:up_diss', 'upgrade:up_cap', 'upgrade:up_range', 'upgrade:up_ammo', 'upgrade:up_repair', 'upgrade:up_gold',
      'escort:escort_cl_std', 'escort:escort_cl_beam', 'hull:card_lightCruiser', 'hull:card_catamaran'
    ],
    epic: [
      'weapon:gun_203', 'weapon:gun_305x2', 'weapon:beam_large', 'weapon:blaster_large', 'weapon:bow_350', 'weapon:torp_800', 'weapon:asm_large',
      'weapon:gun_mortar', 'weapon:fgt_bomber',
      'relic:relic_repair', 'relic:relic_heat', 'relic:relic_torp', 'relic:relic_cargo', 'relic:relic_hull', 'relic:relic_shield',
      'upgrade:up_op10', 'upgrade:up_dmg', 'upgrade:up_heat',
      'escort:escort_ca_std', 'hull:card_heavyCruiser', 'hull:card_hammer', 'hull:card_lship', 'hull:card_carrier'
    ],
    legendary: [
      'weapon:gun_305x2', 'weapon:beam_large', 'weapon:bow_350', 'weapon:torp_800',
      'weapon:beam_annih', 'weapon:gun_apoc', 'weapon:torp_hel',
      'relic:relic_gold', 'relic:relic_core', 'hull:card_battleship', 'hull:card_cross', 'escort:escort_bb_std', 'upgrade:up_op10'
    ]
  };

  /* ---------------- 商人与事件类型 ---------------- */
  D.MERCHANT_POOLS = {};
  (function () {
    const wp = [], guns = [], missiles = [], flak = [], esc = [], hulls = [], hms = [], relics = [], general = [];
    for (const id in D.WEAPONS) {
      const d = D.WEAPONS[id];
      const s = 'weapon:' + id;
      wp.push(s);
      if (d.kind === 'gun') guns.push(s);
      if (d.mount === 'missile') missiles.push(s);
      if ((d.torpMult || 1) >= 1.5 || id === 'gun_ac76') flak.push(s);
    }
    flak.push('hullmod:hm_flak', 'hullmod:hm_ammo', 'consumable:cons_ammo');
    for (const id in D.ESCORT_CARDS) esc.push('escort:' + id);
    for (const id in D.HULL_CARDS) hulls.push('hull:' + id);
    for (const id in D.HULLMODS) hms.push('hullmod:' + id);
    for (const id in D.RELICS) relics.push('relic:' + id);
    for (const id in D.CONSUMABLES) general.push('consumable:' + id);
    for (const id in D.UPGRADES) general.push('upgrade:' + id);
    D.MERCHANT_POOLS = { weapons: wp, guns: guns, missiles: missiles, flak: flak, escort: esc, hull: hulls, hullmod: hms, relic: relics, general: general };
  })();

  D.MERCHANTS = [
    { id: 'weapons', name: '军火贩子', icon: '⚔', pool: 'weapons', desc: '各路制式与拾荒武器都有门路', flavor: '一个独眼军火贩子的货船靠了上来，据说货舱里什么都能搞到。' },
    { id: 'guns', name: '重炮行商', icon: '💣', pool: 'guns', desc: '专营弹道火炮', flavor: '炮架林立的行商船上，成排舰炮等待买家。' },
    { id: 'missiles', name: '鱼雷行商', icon: '🚀', pool: 'missiles', desc: '鱼雷与导弹专卖', flavor: '货舱里整齐码放着涂着防锈油的鱼雷与导弹。' },
    { id: 'flak', name: '近防军火商', icon: '🛡', pool: 'flak', desc: '近防炮与拦截装备', flavor: '这位商人专做保命生意——近防炮、拦截弹药、近防指挥仪。' },
    { id: 'escort', name: '船坞掮客', icon: '🚢', pool: 'escort', desc: '出售整舰与雇佣合同', flavor: '船坞拖船上停着待售的舰艇，连船带人一起交付。' },
    { id: 'hull', name: '船体图纸贩子', icon: '🛳', pool: 'hull', desc: '舰体改装图纸', flavor: '神秘的图纸贩子，声称连遗渊级战列舰的龙骨结构图都能搞到。' },
    { id: 'hullmod', name: '装配工坊', icon: '🔧', pool: 'hullmod', desc: '舰船插件专卖', flavor: '工坊里摆满了装甲带、热阱与舵机——拾荒改装者的天堂。' },
    { id: 'relic', name: '遗迹拾荒商', icon: '🏺', pool: 'relic', desc: '来自遗忘海域的强力遗物', flavor: '专门深入遗忘海域的拾荒商，每件遗物都带着遗迹的气息。' },
    { id: 'general', name: '杂货铺', icon: '🧰', pool: 'general', desc: '消耗品与强化零件', flavor: '什么都卖的杂货船，从修理工具到升级零件应有尽有。' }
  ];

  /** 随机稀有度（随天数提升品质） */
  D.rollRarity = function (day, kind) {
    const t = day - 1;
    let w;
    if (kind === 'big') {
      w = { common: Math.max(8, 40 - t * 6), rare: 36, epic: 16 + t * 4, legendary: 6 + t * 2.5 };
    } else {
      w = { common: Math.max(18, 58 - t * 7), rare: 28 + t * 2, epic: 10 + t * 3, legendary: 3 + t * 1.5 };
    }
    const total = w.common + w.rare + w.epic + w.legendary;
    let r = Math.random() * total;
    if ((r -= w.legendary) < 0) return 'legendary';
    if ((r -= w.epic) < 0) return 'epic';
    if ((r -= w.rare) < 0) return 'rare';
    return 'common';
  };

  /** 从稀有度池抽取一个物品 */
  D.rollItem = function (rarity, excludeIds) {
    const pool = D.ITEM_POOLS[rarity];
    const cands = pool.filter(s => !excludeIds || excludeIds.indexOf(s) < 0);
    const s = cands.length ? cands[Math.floor(Math.random() * cands.length)] : pool[Math.floor(Math.random() * pool.length)];
    const parts = s.split(':');
    return D.makeItem(parts[0], parts[1]);
  };

  /* ---------------- 敌方舰队模板 ---------------- */
  D.ENEMY_TEMPLATES = {
    patrol: { id: 'patrol', name: '督府巡逻队', threat: 2, ships: ['dd_gun'], goldBase: 25, loot: 'small', desc: '正统督府在航线上的例行巡逻。' },
    raiders: { id: 'raiders', name: '锚地劫掠队', threat: 3, ships: ['dd_gun', 'dd_torp'], goldBase: 45, loot: 'small', desc: '自由锚地的拾荒者转行当了海盗。' },
    convoy: { id: 'convoy', name: '铁穹军火商队', threat: 2, ships: ['dd_gun'], goldBase: 80, loot: 'small', lootChance: 0.4, desc: '铁穹重工押运的军火商队，油水丰厚。' },
    elite: { id: 'elite', name: '督府精锐舰队', threat: 4, ships: ['dd_gun', 'cl_std'], goldBase: 60, loot: 'big', desc: '训练有素的督府正规军编队。' },
    taskforce: { id: 'taskforce', name: '自治联盟特遣队', threat: 5, ships: ['ca_std', 'dd_gun'], goldBase: 90, loot: 'big', desc: '环海自治联盟的高科技特遣队。' },
    dread: { id: 'dread', name: '军阀冰封舰队', threat: 6, ships: ['bb_std', 'dd_gun'], goldBase: 125, loot: 'big', desc: '北境军阀的破冰舰队，冷凝核心轰鸣。' },
    boss1: { id: 'boss1', name: '冰皇亲卫舰队', threat: 7, ships: ['bb_std', 'cl_beam', 'dd_torp'], goldBase: 180, loot: 'big', desc: '军阀总旗舰的直属亲卫。' },
    boss2: { id: 'boss2', name: '冰冠号主力舰队', threat: 8, ships: ['bb_std', 'ca_std', 'cl_std', 'dd_gun'], goldBase: 230, loot: 'big', desc: '北境军阀总旗舰——冰冠号！' }
  };

  /** 小/大战斗的候选池（随天数解锁） */
  D.battlePool = function (kind, day) {
    let pool;
    if (kind === 'small') {
      pool = ['patrol', 'raiders', 'convoy', 'elite'];
      if (day >= 3) pool.push('taskforce');
    } else {
      if (day >= 5) return ['dread', 'boss1', 'boss2', 'taskforce'].sort(() => Math.random() - 0.5);
      pool = ['elite', 'taskforce'];
      if (day >= 2) pool.push('dread');
      if (day >= 3) pool.push('boss1');
      while (pool.length < 4) pool.push('raiders', 'patrol');
    }
    const arr = pool.slice().sort(() => Math.random() - 0.5);
    return arr.slice(0, 4);
  };

  /** 敌方/友军随天数的强度缩放 */
  D.enemyScale = function (day, threat) {
    return {
      hp: 1 + 0.13 * (day - 1) + 0.05 * Math.max(0, threat - 2),
      dmg: 1 + 0.05 * (day - 1) + 0.025 * Math.max(0, threat - 2)
    };
  };
  D.allyScale = function (day) {
    return { hp: 1 + 0.1 * (day - 1), dmg: 1 + 0.05 * (day - 1) };
  };
  /** 敌军 AI 随天数/威胁逼近人类水平（始终略慢于人） */
  D.enemySkill = function (day, threat) {
    const t = (day - 1) + Math.max(0, threat - 2) * 0.5;
    return {
      react: Math.max(0.26, 0.5 - 0.05 * t),
      aimErr: Math.max(0.05, 0.13 - 0.014 * t),
      interval: Math.max(0.26, 0.45 - 0.04 * t),
      targetDelay: Math.max(0.5, 1.0 - 0.09 * t),
      dodge: Math.min(0.9, 0.35 + 0.08 * t)
    };
  };

  /** 强制战斗（战斗节点不可选敌）：小战斗=掉落，大战斗=关卡考验 */
  D.forcedPool = function (kind, day) {
    if (kind === 'small') {
      const pool = ['patrol', 'raiders'];
      if (day >= 2) pool.push('convoy');
      if (day >= 3) pool.push('elite');
      if (day >= 4) pool.push('taskforce');
      return pool;
    }
    // 大战斗：随天数升级的关卡，第 5 天固定 BOSS
    if (day >= 5) return ['boss2'];
    if (day === 4) return ['boss1', 'boss2', 'dread'];
    if (day === 3) return ['dread', 'boss1'];
    if (day === 2) return ['taskforce', 'dread'];
    return ['elite', 'taskforce'];
  };

  /** 战斗金币收入 */
  D.battleGold = function (tpl, day, kind) {
    const base = tpl.goldBase + (kind === 'big' ? day * 12 : day * 8);
    return Math.max(1, Math.round(base + (Math.random() * 18 - 8)));
  };

  /* ---------------- 综合属性计算（舰体+插件+升级+遗物+OP调校） ---------------- */
  D.computeStats = function (hullId, hullmods, upgrades, relics, opTuning) {
    const st = D.finalStats(hullId, hullmods, opTuning);
    const m = { armor: 1, speed: 1, turn: 1, diss: 1, cap: 1, range: 1, accel: 1, ammo: 1, repair: 0, flak: 1, dmg: 1, heat: 1, torpResist: 1, gold: 1, cargo: 0, hull: 1, op: 0, coef: 0 };
    const apply = function (fx) {
      for (const k in fx) {
        switch (k) {
          case 'armor': m.armor *= fx[k]; break;
          case 'speed': m.speed *= fx[k]; break;
          case 'turn': m.turn *= fx[k]; break;
          case 'diss': m.diss *= fx[k]; break;
          case 'cap': m.cap *= fx[k]; break;
          case 'range': m.range *= fx[k]; break;
          case 'accel': m.accel *= fx[k]; break;
          case 'ammo': m.ammo *= fx[k]; break;
          case 'repair': m.repair += fx[k]; break;
          case 'flak': m.flak *= fx[k]; break;
          case 'dmg': m.dmg *= fx[k]; break;
          case 'heat': m.heat *= fx[k]; break;
          case 'torpResist': m.torpResist *= fx[k]; break;
          case 'gold': m.gold *= fx[k]; break;
          case 'cargo': m.cargo += fx[k]; break;
          case 'hull': m.hull *= fx[k]; break;
          case 'op': m.op += fx[k]; break;
          case 'coef': m.coef += fx[k]; break;
        }
      }
    };
    for (const uid in (upgrades || {})) {
      const n = upgrades[uid] || 0;
      const u = D.UPGRADES[uid];
      if (u && n > 0) for (let i = 0; i < n; i++) apply(u.effects);
    }
    for (const rid of (relics || [])) {
      const r = D.RELICS[rid];
      if (r) apply(r.effects);
    }
    return {
      hull: st.hull * m.hull,
      armor: st.armor * m.armor,
      maxSpeed: st.maxSpeed * m.speed,
      accel: st.accel * m.accel,
      turnRate: st.turnRate * m.turn,
      heatCap: st.heatCap * m.cap,
      heatDiss: st.heatDiss * m.diss,
      rangeMult: st.rangeMult * m.range,
      ammoMult: st.ammoMult * m.ammo,
      repair: st.repair + m.repair,
      flakMult: st.flakMult * m.flak,
      dmgMult: m.dmg,
      heatMult: m.heat,
      torpResist: m.torpResist,
      goldMult: m.gold,
      cargo: m.cargo,
      op: m.op,
      shieldCoef: Math.max(0.5, st.shieldCoef - m.coef)
    };
  };

  globalThis.Data = D;
})();
