/* ============================================================
   像素风渲染管线：
   世界渲染到 1/PIXEL 分辨率的离屏缓冲（imageSmoothing 关闭），
   扁平配色 + 抖动网格 + 1px 硬描边；UI 文字走全分辨率通道。
   ============================================================ */
(function () {
  'use strict';

  const U = Util, D = Data;
  const DEG = Math.PI / 180;
  const PIXEL = 1; // 全分辨率（关掉低分辨率像素化，便于看清小飞机/弹幕细节）

  /* ---------------- 调色板 ---------------- */
  const PAL = {
    water: ['#08394a', '#0b4559', '#0d5068', '#105c76'],
    foam: '#cfe8f8',
    boundary: '#8a4438',
    buoy: '#c05a4a',
    deckAlly: ['#7c5f3c', '#5e4630', '#94744a'],
    deckEnemy: ['#54626e', '#3e4953', '#68788a'],
    deckNeutral: ['#7c5f3c', '#5e4630', '#94744a'],
    outline: '#0c1a2a',
    deckLine: '#8ab8d8',
    bridge: ['#2c4256', '#1c2e3e'],
    funnel: ['#222f3a', '#141d26'],
    barrel: '#141c24',
    turret: ['#4a5864', '#2c3742'],
    shell: '#ffd9a0',
    tracer: 'rgba(255,220,160,0.45)',
    bolt: '#c8a8ff',
    beam: '#b48cff',
    beamCore: '#f0e4ff',
    torp: '#46586a',
    torpNose: '#cfe8f8',
    missile: '#4a5560',
    fire: '#ff9a3d',
    fireHi: '#ffe9a8',
    spark: '#ffd27a',
    smoke: '#565b62',
    hpAlly: '#5ab8e8',
    hpEnemy: '#e05a5a',
    hpBg: 'rgba(0,0,0,0.65)'
  };

  /* 模块内共享：当前帧 1 像素对应的世界单位 */
  const S = { pw: PIXEL, zoom: 1 };

  /* ---------------- 像素绘制工具 ---------------- */
  function px(b, x, y, w, h, color) { // 1px 矩形（世界坐标，自动取整）
    b.fillStyle = color;
    b.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  function pxDot(b, x, y, color) { px(b, x, y, S.pw, S.pw, color); }

  function pxLine(b, x1, y1, x2, y2, color, w) {
    b.strokeStyle = color;
    b.lineWidth = w || S.pw;
    b.lineCap = 'butt';
    b.beginPath();
    b.moveTo(Math.round(x1), Math.round(y1));
    b.lineTo(Math.round(x2), Math.round(y2));
    b.stroke();
  }

  function pxCircle(b, x, y, r, color, ditherColor) {
    // 像素圆：小半径逐格填充（可棋盘抖动）；大半径走路径（低分辨率下同样呈块状）
    const r0 = Math.max(1, Math.round(r));
    if (r0 > 16) {
      b.fillStyle = color;
      b.beginPath();
      b.arc(Math.round(x), Math.round(y), r0, 0, U.TAU);
      b.fill();
      return;
    }
    b.fillStyle = color;
    for (let yy = -r0; yy <= r0; yy++) {
      for (let xx = -r0; xx <= r0; xx++) {
        if (xx * xx + yy * yy <= r0 * r0) {
          if (ditherColor && ((xx + yy) & 1)) b.fillStyle = ditherColor;
          else b.fillStyle = color;
          b.fillRect(Math.round(x) + xx, Math.round(y) + yy, 1, 1);
        }
      }
    }
  }

  function pxRing(b, x, y, r, color) {
    const r0 = Math.max(1, Math.round(r));
    b.fillStyle = color;
    const steps = Math.max(8, Math.round(r0 * 3));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * U.TAU;
      b.fillRect(Math.round(x + Math.cos(a) * r0), Math.round(y + Math.sin(a) * r0), 1, 1);
    }
  }

  function pxStar(b, x, y, r, color) { // 像素十字闪光
    const r0 = Math.max(2, Math.round(r));
    b.fillStyle = color;
    b.fillRect(Math.round(x) - r0, Math.round(y), r0 * 2 + 1, 1);
    b.fillRect(Math.round(x), Math.round(y) - r0, 1, r0 * 2 + 1);
    b.fillRect(Math.round(x), Math.round(y), 2, 2);
  }

  function ditherRows(b, x0, y0, x1, y1, gap, color, alpha) {
    b.save();
    b.globalAlpha = alpha === undefined ? 0.22 : alpha;
    b.fillStyle = color;
    let yy = Math.round(y0);
    let i = 0;
    while (yy < y1) {
      if (i % 2 === 0) b.fillRect(Math.round(x0), yy, Math.max(1, Math.round(x1 - x0)), S.pw);
      yy += gap * S.pw;
      i++;
    }
    b.restore();
  }

  /* ---------------- 水 ---------------- */
  class Water {
    constructor() {
      this.tile = 96;
      this.cv = document.createElement('canvas');
      this.cv.width = this.cv.height = this.tile;
      const c = this.cv.getContext('2d');
      c.fillStyle = PAL.water[0];
      c.fillRect(0, 0, this.tile, this.tile);
      // 波浪色带（带横向起伏）
      for (let y = 0; y < this.tile; y += 12) {
        const off = Math.floor(Math.sin(y * 0.35) * 3);
        c.fillStyle = PAL.water[1 + (Math.floor(y / 12) % 3)];
        c.beginPath();
        c.moveTo(0, y);
        for (let x = 0; x <= this.tile; x += 8) {
          c.lineTo(x, y + Math.floor(Math.sin((x + off) * 0.5) * 2));
        }
        c.lineTo(this.tile, y + 10);
        c.lineTo(0, y + 10);
        c.closePath();
        c.fill();
      }
      // 波光点
      c.fillStyle = PAL.foam;
      for (let i = 0; i < 26; i++) {
        c.globalAlpha = 0.25 + Math.random() * 0.4;
        c.fillRect(Math.floor(Math.random() * this.tile), Math.floor(Math.random() * this.tile), 1, 1);
      }
      c.globalAlpha = 1;
      // 泡沫碎纹
      c.fillStyle = PAL.water[3];
      for (let i = 0; i < 14; i++) {
        const x = Math.floor(Math.random() * this.tile);
        const y = Math.floor(Math.random() * this.tile);
        c.globalAlpha = 0.2;
        c.fillRect(x, y, 2 + Math.floor(Math.random() * 3), 1);
      }
      c.globalAlpha = 1;
    }

    draw(b, cam, bw, bh, time) {
      const T = this.tile;
      // 远层（视差小）
      let ox = ((Math.round(cam.x * 0.25) + Math.round(time * 7)) % T + T) % T;
      let oy = ((Math.round(cam.y * 0.25) + Math.round(time * 3.5)) % T + T) % T;
      b.globalAlpha = 0.85;
      for (let x = -ox; x < bw; x += T) {
        for (let y = -oy; y < bh; y += T) {
          b.drawImage(this.cv, x, y);
        }
      }
      // 近层（视差大，反向慢速）
      ox = ((Math.round(cam.x * 0.55) - Math.round(time * 12)) % T + T) % T;
      oy = ((Math.round(cam.y * 0.55) - Math.round(time * 6)) % T + T) % T;
      b.globalAlpha = 0.4;
      for (let x = -ox; x < bw; x += T) {
        for (let y = -oy; y < bh; y += T) {
          b.drawImage(this.cv, x, y);
        }
      }
      b.globalAlpha = 1;
    }
  }

  /* ---------------- 船体轮廓（缓存，兼容旧接口） ---------------- */
  const OUTLINES = {};
  function getOutline(hull) {
    if (OUTLINES[hull.id]) return OUTLINES[hull.id];
    const L = hull.len, B = hull.beam;
    let pts, sup, fun;
    switch (hull.shape) {
      case 'cat': // 双体（棱角）
        pts = [
          [-B * 0.52, -L * 0.38], [-B * 0.52, -L * 0.16], [-B * 0.38, L * 0.12], [-B * 0.38, L * 0.42], [0, L * 0.5],
          [B * 0.38, L * 0.42], [B * 0.38, L * 0.12], [B * 0.52, -L * 0.16], [B * 0.52, -L * 0.38], [B * 0.30, -L * 0.44], [B * 0.14, -L * 0.48], [0, -L * 0.46], [-B * 0.14, -L * 0.48], [-B * 0.30, -L * 0.44]
        ];
        sup = { x: -B * 0.16, y: -L * 0.02, w: B * 0.32, h: L * 0.15 };
        fun = { x: -B * 0.07, y: -L * 0.24, w: B * 0.14, h: L * 0.07 };
        break;
      case 'T': // 锤头（宽锤面+厚尾，力大砖飞）
        pts = [
          [-B * 0.38, -L / 2], [B * 0.38, -L / 2], [B * 0.52, -L * 0.34], [B * 0.52, -L * 0.02], [B * 0.30, L * 0.10],
          [B * 0.22, L * 0.36], [0, L * 0.52],
          [-B * 0.22, L * 0.36], [-B * 0.30, L * 0.10], [-B * 0.52, -L * 0.02], [-B * 0.52, -L * 0.34]
        ];
        sup = { x: 0, y: L * 0.10, w: B * 0.30, h: L * 0.10 };
        fun = { x: 0, y: L * 0.40, w: B * 0.22, h: L * 0.08 };
        break;
      case 'cross': // 十字舰（四臂，硬边）
        pts = [
          [0, -L * 0.5], [B * 0.16, -L * 0.28], [B * 0.16, -L * 0.06], [B * 0.5, -L * 0.06], [B * 0.5, L * 0.06], [B * 0.16, L * 0.06], [B * 0.16, L * 0.28], [0, L * 0.5],
          [-B * 0.16, L * 0.28], [-B * 0.16, L * 0.06], [-B * 0.5, L * 0.06], [-B * 0.5, -L * 0.06], [-B * 0.16, -L * 0.06], [-B * 0.16, -L * 0.28]
        ];
        sup = { x: 0, y: 0, w: B * 0.22, h: L * 0.18 };
        fun = { x: 0, y: L * 0.38, w: B * 0.14, h: L * 0.06 };
        break;
      case 'L': // L 形强袭舰（不对称右舷臂）
        pts = [
          [0, -L * 0.5], [-B * 0.16, -L * 0.40], [-B * 0.34, -L * 0.14], [-B * 0.46, L * 0.08], [-B * 0.30, L * 0.24], [-B * 0.14, L * 0.44], [0, L * 0.5],
          [B * 0.28, L * 0.44], [B * 0.50, L * 0.16], [B * 0.52, -L * 0.10], [B * 0.36, -L * 0.34], [B * 0.24, -L * 0.44], [B * 0.10, -L * 0.48]
        ];
        sup = { x: B * 0.1, y: L * 0.02, w: B * 0.28, h: L * 0.15 };
        fun = { x: -B * 0.04, y: -L * 0.2, w: B * 0.12, h: L * 0.07 };
        break;
      default: // 标准（宽钝艏+直硬舷+缺口）
        pts = [
          [-B * 0.20, -L / 2], [B * 0.20, -L / 2], [B * 0.50, -L * 0.34], [B * 0.50, -L * 0.06], [B * 0.36, L * 0.04], [B * 0.48, L * 0.16],
          [B * 0.28, L * 0.34], [B * 0.16, L * 0.46], [0, L * 0.5],
          [-B * 0.16, L * 0.46], [-B * 0.28, L * 0.34], [-B * 0.48, L * 0.16], [-B * 0.36, L * 0.04], [-B * 0.50, -L * 0.06], [-B * 0.50, -L * 0.34]
        ];
        sup = { x: -B * 0.10, y: -L * 0.12, w: B * 0.40, h: L * 0.16 };
        fun = { x: 0, y: L * 0.38, w: B * 0.30, h: L * 0.08 };
    }
    OUTLINES[hull.id] = { pts, sup, fun, L, B };
    return OUTLINES[hull.id];
  }

  function shipWorldPoly(ship) {
    const o = getOutline(ship.hullDef);
    const f = U.dirOf(ship.heading);
    const r = { x: f.y, y: -f.x };
    return o.pts.map(p => ({
      x: ship.x + f.x * p[1] + r.x * p[0],
      y: ship.y + f.y * p[1] + r.y * p[0]
    }));
  }
  function shipWorldPt(ship, lx, ly) {
    const f = U.dirOf(ship.heading);
    const r = { x: f.y, y: -f.x };
    return { x: ship.x + f.x * ly + r.x * lx, y: ship.y + f.y * ly + r.y * lx };
  }
  function shipWorldRect(ship, rect) {
    const f = U.dirOf(ship.heading);
    const r = { x: f.y, y: -f.x };
    return {
      cx: ship.x + f.x * rect.y + r.x * rect.x,
      cy: ship.y + f.y * rect.y + r.y * rect.x,
      hw: rect.w, hh: rect.h
    };
  }

  function deckOf(team) {
    return team === 'ally' ? PAL.deckAlly : (team === 'enemy' ? PAL.deckEnemy : PAL.deckNeutral);
  }

  /* ---------------- 舰船精灵（确定性分层）+ 单路径绘制 ---------------- */
  const SHIP_SPRITES = {};
  const SHIP_SPRITE_CANVAS = 768;
  function registerShipSprites(ids) {
    if (typeof Image === 'undefined') return;
    for (const id of ids) {
      const img = new Image();
      img.onload = () => { SHIP_SPRITES[id] = { img, loaded: true }; };
      img.src = 'sprites/' + id + '.png';
    }
  }
  function drawShipSpriteBest(b, ship, o, scale) {
    const spr = SHIP_SPRITES[ship.hullDef.id];
    if (!spr || !spr.loaded) return false;
    const sc = (SHIP_SPRITE_CANVAS - 140) / Math.max(o.L, o.B);
    const K = 1 / sc;
    const h = SHIP_SPRITE_CANVAS / 2;
    const f = U.dirOf(ship.heading);
    const r = { x: f.y, y: -f.x };
    const a = r.x * K, b2 = r.y * K, c = f.x * K, d = f.y * K;
    const e = ship.x - a * h - c * h;
    const g = ship.y - b2 * h - d * h;
    b.save();
    b.transform(a, b2, c, d, e, g);
    b.drawImage(spr.img, 0, 0);
    b.restore();
    return true;
  }

  /* ---------------- 像素舰船 ---------------- */
  function drawShipPx(b, ship, time) {
    const o = getOutline(ship.hullDef);
    const sinking = ship.alive ? 0 : ship.sinking;
    if (sinking > 3.1) return;
    const alpha = ship.alive ? 1 : Math.max(0, 1 - sinking / 3.2);
    const scale = ship.alive ? 1 : 1 - (sinking / 3.2) * 0.18;
    b.save();
    b.globalAlpha = alpha;
    b.translate(Math.round(ship.x), Math.round(ship.y));
    b.scale(scale, scale);
    b.translate(-Math.round(ship.x), -Math.round(ship.y));

    const poly = shipWorldPoly(ship);
    const deck = deckOf(ship.team);
    const f = U.dirOf(ship.heading);
    const r = { x: f.y, y: -f.x };
    const pw = S.pw;

    if (!drawShipSpriteBest(b, ship, o, scale)) {
    // 阴影（偏移像素块）
    b.save();
    b.translate(Math.round(2 * pw), Math.round(3 * pw));
    b.beginPath();
    poly.forEach((p, i) => i ? b.lineTo(p.x, p.y) : b.moveTo(p.x, p.y));
    b.closePath();
    b.fillStyle = 'rgba(0,6,16,0.5)';
    b.fill();
    b.restore();

    // 甲板
    b.beginPath();
    poly.forEach((p, i) => i ? b.lineTo(p.x, p.y) : b.moveTo(p.x, p.y));
    b.closePath();
    b.fillStyle = deck[0];
    b.fill();
    // 横向甲板纹（clip 内抖动行）+ 舰艏亮区
    b.save();
    b.clip();
    const minY = Math.min.apply(null, poly.map(p => p.y));
    const maxY = Math.max.apply(null, poly.map(p => p.y));
    const minX = Math.min.apply(null, poly.map(p => p.x));
    const maxX = Math.max.apply(null, poly.map(p => p.x));
    ditherRows(b, minX, minY, maxX, maxY, 3.2, deck[1], 0.35);
    const bow = shipWorldPt(ship, 0, o.L / 2);
    const bl = shipWorldPt(ship, -o.B * 0.3, o.L * 0.2);
    const br = shipWorldPt(ship, o.B * 0.3, o.L * 0.2);
    b.beginPath();
    b.moveTo(bow.x, bow.y);
    b.lineTo(bl.x, bl.y);
    b.lineTo(br.x, br.y);
    b.closePath();
    b.fillStyle = deck[2];
    b.fill();
    // 中线（木船深纹 / 钢舰亮纹）
    const stern = shipWorldPt(ship, 0, -o.L / 2);
    const lineCol = ship.team === 'ally'
      ? 'rgba(58,42,24,0.6)'
      : (ship.team === 'enemy' ? 'rgba(214,232,248,0.5)' : 'rgba(70,54,36,0.55)');
    b.beginPath();
    b.moveTo(Math.round(stern.x), Math.round(stern.y));
    b.lineTo(Math.round(bow.x), Math.round(bow.y));
    b.strokeStyle = lineCol;
    b.lineWidth = pw;
    b.stroke();
    b.restore();

    // 舷侧描边
    b.beginPath();
    poly.forEach((p, i) => i ? b.lineTo(p.x, p.y) : b.moveTo(p.x, p.y));
    b.closePath();
    b.strokeStyle = PAL.outline;
    b.lineWidth = pw;
    b.lineJoin = 'miter';
    b.stroke();

    // 上层建筑（舰桥 + 窗户像素）
    const sup = shipWorldRect(ship, o.sup);
    b.save();
    b.translate(Math.round(sup.cx), Math.round(sup.cy));
    b.rotate(ship.heading + Math.PI);
    const shw = Math.round(sup.hw), shh = Math.round(sup.hh);
    b.fillStyle = PAL.bridge[0];
    b.fillRect(-shw, -shh, shw * 2, shh * 2);
    ditherRows(b, -shw, -shh, shw, shh, 2.2, PAL.bridge[1], 0.5);
    b.fillStyle = '#9fd8f0';
    b.fillRect(-Math.round(shw * 0.55), -Math.round(shh * 0.75), Math.round(shw * 1.1), Math.max(1, Math.round(shh * 0.4)));
    b.strokeStyle = PAL.outline;
    b.lineWidth = pw;
    b.strokeRect(-shw, -shh, shw * 2, shh * 2);
    b.restore();

    // 烟囱
    const fun = shipWorldRect(ship, o.fun);
    b.save();
    b.translate(Math.round(fun.cx), Math.round(fun.cy));
    b.rotate(ship.heading + Math.PI);
    const fw = Math.round(fun.hw), fh = Math.round(fun.hh);
    b.fillStyle = PAL.funnel[0];
    b.fillRect(-fw, -fh, fw * 2, fh * 2);
    b.fillStyle = PAL.funnel[1];
    b.fillRect(-fw, -fh, fw * 2, Math.max(1, Math.round(fh * 0.6)));
    b.strokeStyle = PAL.outline;
    b.lineWidth = pw;
    b.strokeRect(-fw, -fh, fw * 2, fh * 2);
    b.restore();
    }

    // 舷灯（左红右绿，1 像素）
    const lx = shipWorldPt(ship, 0, o.L / 2 - 5);
    pxDot(b, lx.x - r.x * ship.hullDef.beam / 2, lx.y - r.y * ship.hullDef.beam / 2, '#ff4a4a');
    pxDot(b, lx.x + r.x * ship.hullDef.beam / 2, lx.y + r.y * ship.hullDef.beam / 2, '#4aff7a');

    // ---- 细节装饰 ----
    // 队色条纹（船舯横带）
    const stripeColor = ship.team === 'ally' ? 'rgba(90,209,255,0.55)' : (ship.team === 'enemy' ? 'rgba(255,95,109,0.55)' : 'rgba(160,200,220,0.4)');
    const st1 = shipWorldPt(ship, -o.B * 0.46, o.L * 0.02);
    const st2 = shipWorldPt(ship, o.B * 0.46, o.L * 0.02);
    pxLine(b, st1.x, st1.y, st2.x, st2.y, stripeColor, Math.max(1, Math.round(2.2 * pw)));
    // 甲板舱盖（暗色像素点）
    b.fillStyle = 'rgba(10,20,32,0.75)';
    for (let i = 0; i < 3; i++) {
      const hy = shipWorldPt(ship, (i - 1) * o.B * 0.16, o.L * (0.06 + i * 0.09));
      b.fillRect(Math.round(hy.x), Math.round(hy.y), Math.max(2, Math.round(pw * 1.4)), Math.max(2, Math.round(pw * 1.4)));
    }
    // 舰艏锚点
    const anchor = shipWorldPt(ship, 0, o.L / 2 - 7);
    pxDot(b, anchor.x, anchor.y, '#101820');
    // 艉部名牌
    const namePlate = shipWorldPt(ship, -o.B * 0.16, -o.L * 0.36);
    b.fillStyle = 'rgba(12,24,36,0.85)';
    b.fillRect(Math.round(namePlate.x), Math.round(namePlate.y), Math.max(4, Math.round(o.B * 0.32)), Math.max(2, Math.round(pw * 1.6)));
    // 艉旗（队色小旗）
    const flag = shipWorldPt(ship, 0, -o.L / 2);
    b.fillStyle = ship.team === 'ally' ? '#5ad1ff' : (ship.team === 'enemy' ? '#ff5f6d' : '#9cc4d8');
    b.fillRect(Math.round(flag.x + r.x * 1), Math.round(flag.y + r.y * 1) - 3, 2, 2);
    b.fillRect(Math.round(flag.x + r.x * 3), Math.round(flag.y + r.y * 3) - 3, 2, 1);
    // 高速烟囱烟 + 艏浪（纯装饰）
    const spd = Math.hypot(ship.vx, ship.vy);
    if (spd > ship.maxSpeed * 0.2 && ship.alive) {
      // 高速烟囱烟
      const funW = shipWorldPt(ship, 0, -o.L * 0.3);
      const puff = 1 + Math.floor(Math.abs(Math.sin(time * 9 + ship.name.length)) * 2);
      b.fillStyle = 'rgba(90,95,100,0.5)';
      b.fillRect(Math.round(funW.x) - 2 - puff, Math.round(funW.y) - 6 - puff, 3 + puff, 2);
      // 排水纹：沿整个前进方向的前沿线(含两侧排水部位)生成, 强度=速度×排水面积(段长)
      const mvx = ship.vx / spd, mvy = ship.vy / spd;
      const poly = shipWorldPoly(ship);
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], c = poly[(i + 1) % poly.length];
        const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
        let ex = c.x - a.x, ey = c.y - a.y;
        const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
        let nx = ey, ny = -ex;
        if ((mx - ship.x) * nx + (my - ship.y) * ny < 0) { nx = -nx; ny = -ny; }  // 朝外
        const facing = nx * mvx + ny * mvy;   // <0 表示前沿线(背对运动), 正在排水
        if (facing < -0.2) {
          const disp = spd * el * 0.6;               // 堆积量 ≈ 速度×排水面积
          const force = Math.min(1.5, disp * 0.04);
          const len = 3 + force * 9;
          const al = Math.min(0.75, 0.35 + force * 0.3);
          pxLine(b, mx, my, mx + nx * len, my + ny * len, 'rgba(224,246,255,' + al.toFixed(2) + ')', Math.max(1, Math.round(pw * (1 + force * 0.7))));
          pxLine(b, mx + nx * len * 0.5, my + ny * len * 0.5, mx + nx * len * 1.5, my + ny * len * 1.5, 'rgba(200,236,255,0.22)', Math.max(1, Math.round(pw * 0.8)));
        }
      }
    }

    // 玩家标记（像素虚线圈）
    if (ship.isPlayer && ship.alive) {
      const steps = 20;
      b.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < steps; i += 2) {
        const a = (i / steps) * U.TAU;
        const rr = ship.radius + 7;
        b.fillRect(Math.round(ship.x + Math.cos(a) * rr), Math.round(ship.y + Math.sin(a) * rr), pw, pw);
      }
    }

    // 武器
    for (const w of ship.weapons) drawWeaponMountPx(b, ship, w, time);
    b.restore();
  }

  function drawWeaponMountPx(b, ship, w, time) {
    const slot = w.slot;
    const sizeR = slot.size === 'large' ? 10 : (slot.size === 'medium' ? 7 : 5);
    const barrelL = slot.size === 'large' ? 24 : (slot.size === 'medium' ? 18 : 13);
    const barrelW = slot.size === 'large' ? 2 : (slot.size === 'medium' ? 1.5 : 1.2);
    const mp = w.worldPos();
    const pw = S.pw;

    if (slot.type === 'missile') {
      // 导弹发射箱
      b.save();
      b.translate(Math.round(mp.x), Math.round(mp.y));
      b.rotate(w.angle);
      b.fillStyle = '#2c3a46';
      b.fillRect(-2, -6, 4, 12);
      b.fillStyle = '#101820';
      b.fillRect(-1, -4, 2, 8);
      b.strokeStyle = 'rgba(255,255,255,0.4)';
      b.lineWidth = pw;
      b.strokeRect(-2, -6, 4, 12);
      b.restore();
      return;
    }
    if (slot.type === 'fixed') {
      // 固定炮管（沿船艏）
      const a = ship.heading;
      const f2 = U.dirOf(a);
      const bx = mp.x, by = mp.y;
      pxLine(b, bx - f2.x * 2, by - f2.y * 2, bx + f2.x * barrelL, by + f2.y * barrelL, PAL.barrel, Math.max(1, Math.round(barrelW * pw)));
      return;
    }
    // 炮塔底座
    pxCircle(b, mp.x, mp.y, sizeR, PAL.turret[0], PAL.turret[1]);
    b.strokeStyle = PAL.outline;
    b.lineWidth = pw;
    b.beginPath();
    b.arc(Math.round(mp.x), Math.round(mp.y), sizeR, 0, U.TAU);
    b.stroke();
    // 炮管
    const f2 = U.dirOf(w.angle);
    const bx0 = mp.x + f2.x * sizeR * 0.5;
    const by0 = mp.y + f2.y * sizeR * 0.5;
    pxLine(b, bx0, by0, mp.x + f2.x * barrelL, mp.y + f2.y * barrelL, PAL.barrel, Math.max(1, Math.round(barrelW * pw)));
    // 光束透镜
    if (w.def.kind === 'beam') {
      pxDot(b, mp.x + f2.x * 3, mp.y + f2.y * 3, w.beamOn ? '#f0d8ff' : '#6a4a8a');
    }
    // 炮口闪光
    if (w.flash > 0) {
      pxStar(b, mp.x + f2.x * barrelL, mp.y + f2.y * barrelL, (w.flash / 0.12) * sizeR * 0.8, PAL.fireHi);
    }
  }

  /* ---------------- 像素弹丸 ---------------- */
  function drawProjectilePx(b, p, time) {
    const a = p.angle;
    if (p.kind === 'torpedo') {
      b.save();
      b.translate(Math.round(p.x), Math.round(p.y));
      b.rotate(a);
      b.fillStyle = PAL.torp;
      b.fillRect(-2, -7, 4, 14);
      b.fillStyle = '#2a3946';
      b.fillRect(-1, -6, 2, 12);
      b.fillStyle = PAL.torpNose;
      b.fillRect(-1, -8, 2, 2);
      b.strokeStyle = 'rgba(160,220,255,0.6)';
      b.lineWidth = S.pw;
      b.strokeRect(-2, -7, 4, 14);
      b.restore();
      return;
    }
    if (p.kind === 'missile') {
      b.save();
      b.translate(Math.round(p.x), Math.round(p.y));
      b.rotate(a);
      b.fillStyle = PAL.missile;
      b.fillRect(-1, -4, 2, 8);
      b.fillStyle = PAL.fire;
      b.fillRect(-1, 4, 2, 2 + Math.round(Math.abs(Math.sin(time * 40 + p.flicker)) * 2));
      b.restore();
      return;
    }
    if (p.kind === 'bolt') {
      pxLine(b, p.x - Math.sin(a) * 6, p.y + Math.cos(a) * 6, p.x, p.y, 'rgba(200,170,255,0.6)', S.pw);
      pxCircle(b, p.x, p.y, 2.5, PAL.bolt);
      pxDot(b, p.x, p.y, '#f4ecff');
      return;
    }
    // 炮弹 + 曳光
    pxLine(b, p.x - Math.sin(a) * 8, p.y + Math.cos(a) * 8, p.x, p.y, PAL.tracer, S.pw);
    pxDot(b, p.x, p.y, PAL.shell);
    if (p.r > 4) px(b, p.x - 1, p.y - 1, 2, 2, PAL.shell);
  }

  /* ---------------- 像素载机（小队战机） ---------------- */
  function drawFighterPx(b, f, time) {
    const a = f.angle;
    const wing = f.team === 'enemy' ? '#c85050' : '#58a8e8';
    b.save();
    b.translate(Math.round(f.x), Math.round(f.y));
    b.rotate(a);
    // 机身 + 尾焰
    b.fillStyle = wing;
    b.fillRect(-1, -5, 3, 10);
    b.fillStyle = '#e8e8f0';
    b.fillRect(0, -6, 1, 2);
    b.fillStyle = 'rgba(255,210,122,0.9)';
    b.fillRect(0, 5, 1, 1 + Math.round(Math.abs(Math.sin(time * 30 + f.idx * 2)) * 2));
    // 机翼
    b.fillStyle = wing;
    b.fillRect(-4, -2, 3, 2);
    b.fillRect(2, -2, 3, 2);
    // 受损冒烟
    if (f.hp < f.def.hp * 0.4 && Math.floor(time * 10 + f.idx) % 2 === 0) {
      pxDot(b, 0, 0, 'rgba(120,120,130,0.8)');
    }
    b.restore();
  }

  /* ---------------- 像素光束 ---------------- */
  function drawBeamPx(b, w, time) {
    const ship = w.ship;
    const mp = w.worldPos();
    const dir = U.dirOf(w.angle);
    const ex = mp.x + dir.x * w.beamHit;
    const ey = mp.y + dir.y * w.beamHit;
    const flick = 0.8 + Math.sin(time * 55 + w.slot.id.charCodeAt(0)) * 0.2;
    b.save();
    b.globalCompositeOperation = 'lighter';
    pxLine(b, mp.x, mp.y, ex, ey, 'rgba(180,140,255,' + (0.3 * flick).toFixed(2) + ')', 4 * S.pw);
    pxLine(b, mp.x, mp.y, ex, ey, 'rgba(240,225,255,' + (0.9 * flick).toFixed(2) + ')', S.pw);
    b.globalCompositeOperation = 'source-over';
    pxStar(b, ex, ey, 2, PAL.beamCore);
    b.restore();
  }

  /* ---------------- 像素特效 ---------------- */
  function drawEffectPx(b, e) {
    const t = e.life / e.maxLife;
    b.save();
    switch (e.type) {
      case 'spark':
        b.globalAlpha = e.alpha;
        pxDot(b, e.x, e.y, e.color);
        break;
      case 'smoke':
        b.globalAlpha = e.alpha * 0.55;
        pxCircle(b, e.x, e.y, e.size * (1 + t * 2), PAL.smoke, 'rgba(0,0,0,0)');
        break;
      case 'fire':
        b.globalAlpha = e.alpha;
        pxCircle(b, e.x, e.y, e.size, PAL.fire, '#ff7a3d');
        if (e.size > 7) pxCircle(b, e.x, e.y, e.size * 0.4, PAL.fireHi);
        break;
      case 'foam':
        b.globalAlpha = e.alpha * 0.85;
        pxDot(b, e.x, e.y, e.color);
        if (e.size > 2.5) px(b, e.x - 1, e.y, 2, 1, e.color);
        break;
      case 'bubble':
        b.globalAlpha = e.alpha * 0.8;
        b.strokeStyle = e.color;
        b.lineWidth = S.pw;
        b.strokeRect(Math.round(e.x - e.size / 2), Math.round(e.y - e.size / 2), Math.max(2, Math.round(e.size)), Math.max(2, Math.round(e.size)));
        break;
      case 'ring':
        b.globalAlpha = e.alpha * 0.7;
        pxRing(b, e.x, e.y, e.size * (0.3 + t * 1.8), e.color);
        break;
      case 'flash':
        b.globalAlpha = e.alpha;
        pxStar(b, e.x, e.y, e.size * (0.8 + t), PAL.fireHi);
        break;
      case 'wakep':
        b.globalAlpha = e.alpha * 0.5;
        pxDot(b, e.x, e.y, '#d8f2ff');
        break;
      case 'text':
        b.globalAlpha = e.alpha;
        b.font = 'bold ' + Math.max(5, Math.round(e.size * 0.6)) + 'px monospace';
        b.textAlign = 'center';
        b.fillStyle = '#000';
        b.fillText(e.text, Math.round(e.x) + 1, Math.round(e.y) + 1);
        b.fillStyle = e.color;
        b.fillText(e.text, Math.round(e.x), Math.round(e.y));
        break;
    }
    b.restore();
  }

  /* ---------------- 像素尾迹 ---------------- */
  function drawWakesPx(b, game) {
    for (const ship of game.ships) {
      if (!ship.wake.length) continue;
      for (const p of ship.wake) {
        const t = p.t / 2.3;
        const a = Math.max(0, 1 - t) * 0.38;
        b.globalAlpha = a;
        b.fillStyle = '#d8f2ff';
        const rr = Math.max(1, Math.round(p.w * (0.7 + t * 0.85)));
        b.fillRect(Math.round(p.x - rr / 2), Math.round(p.y - rr / 2), rr, rr);
      }
    }
    b.globalAlpha = 1;
  }

  /* ---------------- 像素边界 ---------------- */
  function drawBoundaryPx(b, game) {
    const W = game.worldW, H = game.worldH;
    b.fillStyle = 'rgba(2,6,16,0.65)';
    b.fillRect(-4000, -4000, 4000 + W + 4000, 4000);
    b.fillRect(-4000, H, 4000 + W + 4000, 4000);
    b.fillRect(-4000, 0, 4000, H);
    b.fillRect(W, 0, 4000, H);
    b.strokeStyle = PAL.boundary;
    b.lineWidth = S.pw;
    b.setLineDash([10, 8]);
    b.strokeRect(0, 0, W, H);
    b.setLineDash([]);
    const buoys = [[0, 0], [W, 0], [0, H], [W, H], [W / 2, 0], [W / 2, H], [0, H / 2], [W, H / 2]];
    const blink = Math.abs(Math.sin(game.time * 2.2)) > 0.5;
    for (const bu of buoys) {
      px(b, bu[0] - 4, bu[1] - 4, 8, 8, PAL.buoy);
      if (blink) px(b, bu[0] - 1, bu[1] - 1, 2, 2, '#ffd9a0');
    }
  }

  /* ---------------- 屏幕覆盖层（像素） ---------------- */
  function drawOverlayPx(b, game, bw, bh) {
    const cam = game.camera;
    const z = cam.zoom / PIXEL;
    // 锁定目标框（四角括号）
    const t = game.playerTarget;
    if (t && t.alive && !t.removed) {
      const tx = Math.round((t.x - cam.x) * z + bw / 2);
      const ty = Math.round((t.y - cam.y) * z + bh / 2);
      const rs = Math.round(t.radius * z) + 5;
      const L = 4;
      b.fillStyle = 'rgba(255,95,109,0.95)';
      b.fillRect(tx - rs, ty - rs, L, 1); b.fillRect(tx - rs, ty - rs, 1, L);
      b.fillRect(tx + rs - L, ty - rs, L, 1); b.fillRect(tx + rs, ty - rs, 1, L);
      b.fillRect(tx - rs, ty + rs, L, 1); b.fillRect(tx - rs, ty + rs - L, 1, L);
      b.fillRect(tx + rs - L, ty + rs, L, 1); b.fillRect(tx + rs, ty + rs - L, 1, L);
    }
  }

  /* ---------------- 全分辨率：进度条小工具 ---------------- */
  function drawBar(ctx, x, y, w, h, ratio, fill, bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w * U.clamp(ratio, 0, 1), h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  }

  /* ---------------- 全分辨率：跟随式半透明状态面板 ---------------- */
  function drawStatusPanel(ctx, ship, game) {
    const isPlayer = !!ship.isPlayer;
    const W = 128, rowH = 11, titleH = 16, pad = 6;
    const hasShield = ship.shield;
    const hasBays = ship.bays && ship.bays.length > 0;
    const H = titleH + 2 * rowH + (hasShield ? 22 : 0) + (hasBays ? 22 : 0) + pad;
    const x = ship.x + ship.radius + 10;
    const y = ship.y - ship.radius - H + 4;

    ctx.save();
    ctx.fillStyle = 'rgba(4,12,22,0.60)';
    ctx.strokeStyle = isPlayer ? 'rgba(120,200,255,0.55)' : 'rgba(255,120,140,0.55)';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, W, H);
    ctx.strokeRect(x, y, W, H);

    ctx.font = 'bold 11px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isPlayer ? '#dff2ff' : '#ffd2d2';
    ctx.fillText((ship.name || '').slice(0, 10), x + pad, y + 3);

    let ry = y + titleH;
    drawBar(ctx, x + pad, ry, W - pad * 2, 8, Math.max(0, ship.hull / ship.hullMax),
      isPlayer ? '#5ab8e8' : '#e05a5a', 'rgba(255,255,255,0.15)');
    ry += rowH;
    // 热量条（含硬损伤底层的独立颜色）
    const heatR = U.clamp(ship.heat / ship.heatCap, 0, 1);
    let heatCol = heatR > 0.85 ? '#ff9a3d' : (heatR > 0.6 ? '#ffd27a' : '#5ad1ff');
    if (ship.overloaded() && Math.floor(game.time * 5) % 2 === 0) heatCol = '#ff4a4a';
    drawBar(ctx, x + pad, ry, W - pad * 2, 8, heatR, heatCol, 'rgba(255,255,255,0.15)');
    if (ship.shield && ship.shield.hard > 0) {
      const hw = (W - pad * 2) * Math.min(1, ship.shield.hard / ship.heatCap);
      ctx.fillStyle = 'rgba(150,40,60,0.75)';
      ctx.fillRect(x + pad, ry, hw, 8);
    }
    ry += rowH;
    if (hasShield) {
      // 护盾状态：开=青绿（显示硬损伤占用），关=灰
      const hardPct = ship.shield.hard > 0 ? Math.min(1, ship.shield.hard / ship.heatCap) : 0;
      drawBar(ctx, x + pad, ry, W - pad * 2, 8, hardPct,
        ship.shield.on ? '#5ae0c8' : '#7a8290', 'rgba(255,255,255,0.15)');
      ctx.font = '9px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillStyle = ship.shield.on ? '#9fe8d8' : '#b8c0cc';
      ctx.fillText('护盾' + (ship.shield.on ? '开' : '关') + ' · 硬损 ' + Math.round(hardPct * 100) + '%', x + pad, ry + 10);
    }
    if (hasBays) {
      // 整备值：航母机库状态
      ry += 22;
      drawBar(ctx, x + pad, ry, W - pad * 2, 8, ship.prep / 100,
        '#e8b45a', 'rgba(255,255,255,0.15)');
      ctx.font = '9px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#e8d9b0';
      ctx.fillText('整备 ' + Math.round(ship.prep) + '%', x + pad, ry + 10);
    }
    ctx.restore();
  }

  /* ---------------- 全分辨率：瞄准线末端（靠近准星）的连续过热条 ---------------- */
  function drawHeatBar(ctx, game, s, aimA, dist) {
    const ratio = U.clamp(s.heat / s.heatCap, 0, 1);
    const hardRatio = s.shield ? U.clamp(s.shield.hard / s.heatCap, 0, 1) : 0;
    const W = 58, H = 8;
    let col = ratio > 0.85 ? '#ff9a3d' : (ratio > 0.6 ? '#ffd27a' : '#5ad1ff');
    if (s.overloaded() && Math.floor(game.time * 6) % 2 === 0) col = '#ff4a4a';
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(aimA - Math.PI / 2);
    ctx.translate(dist, -16);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, W * ratio, H); // 无级连续填充
    if (hardRatio > 0) { // 硬损伤：单独颜色（深红条纹感）
      ctx.fillStyle = 'rgba(255,85,112,0.4)';
      ctx.fillRect(0, 0, W * hardRatio, H);
      ctx.fillStyle = '#ff5570';
      ctx.fillRect(0, 0, W * hardRatio, 2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-0.5, -0.5, W + 1, H + 1);
    ctx.restore();
  }

  /* ---------------- 全分辨率：选定武器组射程圆弧 + 编号 ---------------- */
  function drawWeaponArcs(ctx, game, s, weapons, aimA, cursorDist) {
    const labelGap = 13;
    ctx.font = 'bold 11px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    weapons.forEach((w, i) => {
      const center = s.heading + w.slot.center * DEG;
      const half = w.slot.arc * DEG / 2;
      const a0 = center - half, a1 = center + half;
      const inArc = Math.abs(U.angleDiff(aimA, center)) <= half;
      const canHit = inArc && cursorDist <= w.range + 40;
      // 圆弧（世界角 → canvas 角 = a - π/2）
      ctx.strokeStyle = canHit ? 'rgba(90,209,255,0.9)' : 'rgba(120,170,210,0.45)';
      ctx.lineWidth = canHit ? 2 : 1.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, w.range, a0 - Math.PI / 2, a1 - Math.PI / 2);
      ctx.stroke();
      // 端点刻度
      ctx.fillStyle = canHit ? 'rgba(90,209,255,0.9)' : 'rgba(120,170,210,0.5)';
      ctx.fillRect(s.x + Math.sin(a0) * w.range - 1, s.y - Math.cos(a0) * w.range - 1, 2, 2);
      ctx.fillRect(s.x + Math.sin(a1) * w.range - 1, s.y - Math.cos(a1) * w.range - 1, 2, 2);
      // 编号：沿中点方向、半径外一点，再按左右车道错开（对称；奇数时左边多一个）
      const lane = (i % 2 === 0) ? -(Math.floor(i / 2) + 1) : (Math.floor(i / 2) + 1);
      const lr = w.range + 12;
      const bx = s.x + Math.sin(center) * lr;
      const by = s.y - Math.cos(center) * lr;
      const perp = aimA + Math.PI / 2;
      const lx = bx + Math.sin(perp) * lane * labelGap;
      const ly = by - Math.cos(perp) * lane * labelGap;
      const label = String(i + 1);
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(lx - tw / 2 - 3, ly - 7, tw + 6, 14);
      ctx.fillStyle = canHit ? '#bfe8ff' : 'rgba(210,230,245,0.75)';
      ctx.fillText(label, lx, ly + 0.5);
    });
  }

  /* ---------------- 全分辨率：光标瞄准线（舰心→光标 + 过热 + 射程圆弧） ---------------- */
  function drawAimOverlay(ctx, game) {
    const s = game.player;
    if (!s || !s.alive) return;
    const aimX = game.input.aimX, aimY = game.input.aimY;
    const dx = aimX - s.x, dy = aimY - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const aimA = U.angleOf(dx, dy);

    ctx.save();
    // 舰心 → 光标连线（淡虚线）
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(aimX, aimY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 靠近箭头端的连续过热条
    const barDist = Math.max(26, dist - 78);
    drawHeatBar(ctx, game, s, aimA, barDist);

    // 选定武器组：射程圆弧 + 编号
    const gr = s.groups[game.input.selectedGroup || 1];
    if (gr && gr.weapons.length) {
      drawWeaponArcs(ctx, game, s, gr.weapons, aimA, dist);
    }

    // 光标端点箭头
    const tip = 9;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(aimX + Math.sin(aimA) * tip, aimY - Math.cos(aimA) * tip);
    ctx.lineTo(aimX + Math.sin(aimA + 2.6) * tip, aimY - Math.cos(aimA + 2.6) * tip);
    ctx.lineTo(aimX + Math.sin(aimA - 2.6) * tip, aimY - Math.cos(aimA - 2.6) * tip);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- 全分辨率标签（可读中文） ---------------- */
  function drawShipLabel(ctx, ship, game) {
    const w = Math.max(36, ship.hullDef.len * 0.85);
    const x = ship.x - w / 2;
    const y = ship.y - ship.radius - 26;
    ctx.save();
    ctx.fillStyle = PAL.hpBg;
    ctx.fillRect(x - 2, y - 2, w + 4, 9);
    const ratio = Math.max(0, ship.hull / ship.hullMax);
    ctx.fillStyle = ship.team === 'enemy' ? PAL.hpEnemy : PAL.hpAlly;
    ctx.fillRect(x, y, w * ratio, 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 2, y - 2, w + 4, 9);
    ctx.font = 'bold 11px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(ship.name, ship.x + 1, y - 6 + 1);
    ctx.fillStyle = ship.team === 'enemy' ? '#ffb4b4' : (ship.isPlayer ? '#ffffff' : '#b8dcff');
    ctx.fillText(ship.name, ship.x, y - 6);
    if (ship.vent.active && ship.alive) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(ship.x - 34, y - 20, 68, 13);
      ctx.fillStyle = '#8fe0ff';
      ctx.font = 'bold 10px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillText('散热中…', ship.x, y - 10);
    }
    ctx.restore();
  }

  /* ---------------- 主入口 ---------------- */
  const Renderer = {
    pixel: PIXEL,
    buffer: null,
    bufCtx: null,
    bufW: 0,
    bufH: 0,
    water: (typeof document !== 'undefined') ? new Water() : null,

    _ensureBuffer(vw, vh) {
      const bw = Math.max(64, Math.ceil(vw / PIXEL));
      const bh = Math.max(64, Math.ceil(vh / PIXEL));
      if (!this.buffer || bw !== this.bufW || bh !== this.bufH) {
        this.bufW = bw;
        this.bufH = bh;
        this.buffer = document.createElement('canvas');
        this.buffer.width = bw;
        this.buffer.height = bh;
        this.bufCtx = this.buffer.getContext('2d');
      }
      return this.bufCtx;
    },

    draw(ctx, game) {
      const vw = game.viewW, vh = game.viewH;
      const b = this._ensureBuffer(vw, vh);
      const bw = this.bufW, bh = this.bufH;
      const cam = game.camera, zoom = cam.zoom;
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.imageSmoothingEnabled = false;
      S.zoom = zoom;
      S.pw = PIXEL / zoom;

      b.fillStyle = PAL.water[0];
      b.fillRect(0, 0, bw, bh);
      if (this.water) this.water.draw(b, cam, bw, bh, game.time);

      b.save();
      b.translate(Math.round(bw / 2), Math.round(bh / 2));
      b.scale(zoom / PIXEL, zoom / PIXEL);
      b.translate(-cam.x, -cam.y);

      drawBoundaryPx(b, game);
      drawWakesPx(b, game);
      for (const s of game.ships) drawShipPx(b, s, game.time);
      for (const p of game.projectiles) drawProjectilePx(b, p, game.time);
      for (const f of game.fighters) drawFighterPx(b, f, game.time);
      for (const s of game.ships) {
        for (const w of s.weapons) {
          if (w.def.kind === 'beam' && w.beamOn) drawBeamPx(b, w, game.time);
        }
      }
      for (const e of game.effects) drawEffectPx(b, e);
      b.restore();

      drawOverlayPx(b, game, bw, bh);

      // 放大到全分辨率（像素硬边）
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.buffer, 0, 0, bw, bh, 0, 0, vw, vh);
      ctx.imageSmoothingEnabled = true;

      // 全分辨率标签通道
      ctx.save();
      ctx.translate(vw / 2 - cam.x * zoom, vh / 2 - cam.y * zoom);
      ctx.scale(zoom, zoom);
      for (const s of game.ships) {
        if (!s.alive) continue;
        const locked = game.playerTarget === s;
        if (s.isPlayer || locked) drawStatusPanel(ctx, s, game);
        else drawShipLabel(ctx, s, game);
      }
      drawAimOverlay(ctx, game);
      ctx.restore();
    },

    /* ---------------- 改装蓝图（重构版：大画布居中 + 全分辨率槽位 + 仅选中显示射界 + 缩放/平移） ---------------- */
    blueprintScale(hullDef, w, h) {
      // 船体尽量占满画布，四周留出槽位标签空间（边距收紧，船更大）
      return Math.min((w - 20) / (hullDef.len + 22), (h - 66) / (hullDef.len + 22));
    },

    /** 命中测试：屏幕坐标 → 槽位（纯函数，可测试；view = {zoom, ox, oy}） */
    slotHit(hullDef, w, h, x, y, view) {
      const v = view || { zoom: 1, ox: 0, oy: 0 };
      const scale = this.blueprintScale(hullDef, w, h) * v.zoom;
      const cx = w / 2 + v.ox, cy = h / 2 + 10 + v.oy;
      let best = null, bd = 30 * 30;
      for (const slot of hullDef.slots) {
        const px = cx + slot.x * scale;
        const py = cy - slot.y * scale;
        const d = (x - px) * (x - px) + (y - py) * (y - py);
        if (d < bd) { bd = d; best = slot; }
      }
      return best ? best.id : null;
    },

    drawHullBlueprint(ctx, hullDef, loadout, selSlotId, w, h, time, hoverSlotId, view) {
      const v = view || { zoom: 1, ox: 0, oy: 0 };
      const fit = this.blueprintScale(hullDef, w, h);
      const scale = fit * v.zoom;
      const bw = Math.max(64, Math.ceil(w / PIXEL));
      const bh = Math.max(64, Math.ceil(h / PIXEL));
      const scratch = document.createElement('canvas');
      scratch.width = bw;
      scratch.height = bh;
      const b = scratch.getContext('2d');
      b.imageSmoothingEnabled = false;
      const z = scale / PIXEL;
      S.zoom = 1;
      S.pw = PIXEL / scale;
      const cx = w / 2 + v.ox, cy = h / 2 + 10 + v.oy;

      // ---- 低分辨率通道：只画船体与已装武器（美术像素化） ----
      b.fillStyle = '#08394a';
      b.fillRect(0, 0, bw, bh);
      b.save();
      b.translate(Math.round(cx / PIXEL), Math.round(cy / PIXEL));
      b.scale(z, z);
      b.translate(-cx, -cy);
      const fakeShip = {
        x: cx, y: cy, heading: 0,
        hullDef: hullDef, team: 'neutral', name: hullDef.name,
        weapons: [], alive: true, sinking: 0, isPlayer: false,
        vx: 0, vy: 0, maxSpeed: 1
      };
      drawShipPx(b, fakeShip, time);
      for (const slot of hullDef.slots) {
        const wid = loadout && loadout.weapons[slot.id];
        if (!wid) continue;
        const wdef = D.WEAPONS[wid];
        if (!wdef) continue;
        const wMock = {
          slot: slot, def: wdef, ship: fakeShip,
          angle: slot.type === 'fixed' ? 0 : slot.center * DEG,
          beamOn: false, flash: 0,
          worldPos: () => ({ x: cx + slot.x, y: cy - slot.y })
        };
        drawWeaponMountPx(b, fakeShip, wMock, time);
      }
      b.restore();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(scratch, 0, 0, bw, bh, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;

      // ---- 全分辨率通道：网格 + 槽位 + 清晰标签 ----
      ctx.strokeStyle = 'rgba(120,190,240,0.06)';
      ctx.lineWidth = 1;
      const gs = 46;
      for (let x = (cx % gs); x < w; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = (cy % gs); y < h; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      const R = { small: 13, medium: 16, large: 20 };
      for (const slot of hullDef.slots) {
        const px = cx + slot.x * scale;
        const py = cy - slot.y * scale;
        const wid = loadout && loadout.weapons[slot.id];
        const selected = slot.id === selSlotId;
        const hovered = slot.id === hoverSlotId;
        const r = R[slot.size];

        // 射界扇形：仅选中时显示（按需求）
        if (selected) {
          const centerA = slot.center * DEG - Math.PI / 2;
          const arc = slot.arc * DEG;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.arc(px, py, r + 42, centerA - arc / 2, centerA + arc / 2);
          ctx.closePath();
          ctx.fillStyle = 'rgba(90,209,255,0.10)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(90,209,255,0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // 方向线
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(centerA) * (r + 42), py + Math.sin(centerA) * (r + 42));
          ctx.strokeStyle = 'rgba(90,209,255,0.35)';
          ctx.stroke();
          // 选中外圈
          ctx.strokeStyle = '#ffd27a';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(px, py, r + 6, 0, U.TAU);
          ctx.stroke();
        } else if (hovered) {
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, r + 4, 0, U.TAU);
          ctx.stroke();
        }

        // 槽位本体（全分辨率矢量，不参与像素化）
        if (slot.type === 'turret') {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, U.TAU);
          ctx.fillStyle = wid ? 'rgba(36,54,74,0.92)' : 'rgba(13,24,40,0.88)';
          ctx.fill();
          ctx.strokeStyle = selected ? '#ffd27a' : (wid ? '#5ad1ff' : '#7fa8c8');
          ctx.lineWidth = selected ? 2.5 : 1.6;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px, py, r * 0.42, 0, U.TAU);
          ctx.strokeStyle = wid ? '#9fe0ff' : 'rgba(120,170,210,0.65)';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (slot.type === 'fixed') {
          ctx.beginPath();
          ctx.moveTo(px, py - r);
          ctx.lineTo(px + r * 0.85, py + r * 0.62);
          ctx.lineTo(px - r * 0.85, py + r * 0.62);
          ctx.closePath();
          ctx.fillStyle = wid ? 'rgba(64,44,42,0.92)' : 'rgba(30,20,20,0.88)';
          ctx.fill();
          ctx.strokeStyle = selected ? '#ffd27a' : (wid ? '#ff9a5a' : '#a8785e');
          ctx.lineWidth = selected ? 2.5 : 1.6;
          ctx.stroke();
        } else {
          ctx.fillStyle = wid ? 'rgba(36,56,42,0.92)' : 'rgba(18,30,22,0.88)';
          ctx.fillRect(px - r * 0.8, py - r * 0.55, r * 1.6, r * 1.1);
          ctx.strokeStyle = selected ? '#ffd27a' : (wid ? '#59e08a' : '#5f9a6e');
          ctx.lineWidth = selected ? 2.5 : 1.6;
          ctx.strokeRect(px - r * 0.8, py - r * 0.55, r * 1.6, r * 1.1);
        }

        // 槽位 ID（全分辨率清晰字体）
        ctx.font = 'bold 10px Consolas, "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = selected ? '#ffe9a8' : (wid ? '#cfeaff' : 'rgba(180,205,230,0.95)');
        ctx.fillText(slot.id, px, py + r + 13);
        // 已装武器名（全分辨率）
        if (wid) {
          const wdef2 = D.WEAPONS[wid];
          const nm = wdef2.name.length > 8 ? wdef2.name.slice(0, 7) + '…' : wdef2.name;
          ctx.font = '9px "Segoe UI","Microsoft YaHei",sans-serif';
          ctx.fillStyle = 'rgba(5,12,20,0.85)';
          ctx.fillText(nm, px + 1, py - r - 7 + 1);
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.fillText(nm, px, py - r - 7);
        }
      }

      // 舰名（全分辨率）
      ctx.font = 'bold 15px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillText(hullDef.name, w / 2 + 1, h - 16 + 1);
      ctx.fillStyle = '#e8b45a';
      ctx.fillText(hullDef.name, w / 2, h - 16);
      ctx.font = '11px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillStyle = 'rgba(140,180,210,0.85)';
      ctx.fillText(hullDef.cls + ' · 舰长 ' + hullDef.len + 'm · ' + hullDef.slots.length + ' 槽位', w / 2, h - 3);
    },

    /* ---------- 旗舰小图(像素叠层 + 已装配武器) ---------- */
    drawShipMini(canvas, hullDef, loadout) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const fit = Math.min((w - 16) / hullDef.len, (h - 16) / hullDef.len);
      const cx = w / 2, cy = h / 2;
      const fakeShip = { x: cx, y: cy, heading: 0, hullDef: hullDef, team: 'neutral', name: hullDef.name,
        weapons: [], alive: true, sinking: 0, isPlayer: false, vx: 0, vy: 0, maxSpeed: 1 };
      const oldPw = S.pw, oldZoom = S.zoom;
      S.pw = 1 / fit; S.zoom = 1;
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(fit, fit); ctx.translate(-cx, -cy);
      drawShipPx(ctx, fakeShip, 0);
      for (const slot of hullDef.slots) {
        const wid = loadout && loadout.weapons[slot.id];
        if (!wid) continue;
        const wdef = D.WEAPONS[wid];
        if (!wdef) continue;
        const wMock = { slot: slot, def: wdef, ship: fakeShip,
          angle: slot.type === 'fixed' ? 0 : slot.center * DEG, beamOn: false, flash: 0,
          worldPos: () => ({ x: cx + slot.x, y: cy - slot.y }) };
        drawWeaponMountPx(ctx, fakeShip, wMock, 0);
      }
      ctx.restore();
      S.pw = oldPw; S.zoom = oldZoom;
    },

    /* 兼容导出 */
    registerShipSprites: registerShipSprites,
    getOutline: getOutline,
    drawShip: (b, ship, time) => drawShipPx(b, ship, time),
    drawProjectile: drawProjectilePx,
    drawBeam: drawBeamPx,
    drawEffect: drawEffectPx,
    drawShipLabel: drawShipLabel
  };

  globalThis.Renderer = Renderer;
})();
