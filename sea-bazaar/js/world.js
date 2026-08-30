/* ============================================================
   世界地图场景 v0.1（沙盒骨架）：区域/舰队移动(惯量+洋流)/燃料·补给·水·士气/接战交互
   ============================================================ */
(function () {
  'use strict';
  const W = WorldData;
  const REG = {}; W.REGIONS.forEach(r => REG[r.id] = r);
  const COL = W.COLONIES;
  // 区域地图位置(0..1) + 洋流箭头可视化
  const LAYOUT = {
    tide_hollow: { x: 0.22, y: 0.62 }, ember_ring: { x: 0.52, y: 0.24 },
    deep_trench: { x: 0.72, y: 0.72 }, frost_rift: { x: 0.86, y: 0.34 }, drift_solar: { x: 0.44, y: 0.86 }
  };
  const TERRAIN_COLOR = { shallow: '#1d5f6e', calm: '#2a6f6f', reef: '#1f6f5c', volcano: '#5e3226', deep: '#12314d', solar: '#4f5a33', ice: '#5f7c8c', reef_shore: '#3f6f52', dead_sea: '#3a2f4a', wreck: '#4a4a42' };

  const WorldApp = {
    game: null, canvas: null, ctx: null, raf: 0, lastT: 0, running: false,
    keys: {}, sel: null, menuOpen: false, time: 0, speedIdx: 2,
    SPEEDS: [0, 10, 20, 30, 60],   // 现实秒每游戏分钟? 简化: 每帧游戏小时推进倍率
    init() {
      this.canvas = document.getElementById('world-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.bindInput();
      document.querySelectorAll('#world-menu .wm-act').forEach(b => { b.onclick = () => { if (b.dataset.close) this.closeMenu(); else this.action(b.dataset.act); }; });
      this.game = this.newGame();
    },
    newGame() {
      const g = { fleets: [], log: [], hour: 8, day: 1, landT: 0 };
      const st = W.STARTS;
      g.player = {
        pos: { x: st.fleet.pos.x, y: st.fleet.pos.y }, vel: { x: 0, y: 0 }, heading: -Math.PI / 2,
        fuel: st.fleet.fuel, supply: st.fleet.supply, water: st.fleet.water,
        waterTier: st.fleet.waterTier, morale: st.fleet.morale, crew: 40
      };
      // 势力舰队出生
      for (const fid in W.FACTIONS) {
        const f = W.FACTIONS[fid];
        f.fleets.forEach((tplId, i) => {
          const tpl = W.FLEET_TEMPLATES[tplId];
          const rid = W.REGIONS[(i + 1) % W.REGIONS.length].id;
          g.fleets.push(this.mkFleet(fid, tplId, tpl, rid, fid === 'pirate'));
        });
      }
      return g;
    },
    mkFleet(fid, tplId, tpl, regionId, hostile) {
      const rid = regionId, c = COL[REG[rid].colonies[0]];
      return {
        id: tplId + '_' + Math.random().toString(16).slice(2, 6), fid, tplId, tpl,
        pos: { x: LAYOUT[rid].x + (Math.random() - 0.5) * 0.05, y: LAYOUT[rid].y + (Math.random() - 0.5) * 0.05 },
        vel: { x: 0, y: 0 }, target: c.id, state: 'sail', stateT: 0, cargo: {}, hostile: hostile
      };
    },
    regionAt(p) {
      let best = null, bd = 1e9;
      for (const rid in LAYOUT) {
        const d = Math.hypot(p.x - LAYOUT[rid].x, p.y - LAYOUT[rid].y);
        if (d < bd) { bd = d; best = rid; }
      }
      return best;
    },

    /* ---------- 主循环 ---------- */
    open() {
      MainApp.show('run');
      document.querySelectorAll('.run-view').forEach(v => v.classList.add('hidden'));
      document.getElementById('view-world').classList.remove('hidden');
      this.running = true; this.init(); this.loop(performance.now());
    },
    close() { this.running = false; cancelAnimationFrame(this.raf); },
    loop(t) {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - this.lastT) / 1000); this.lastT = t;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame((ts) => this.loop(ts));
    },

    /* ---------- 更新 ---------- */
    update(dt) {
      const g = this.game, p = g.player;
      // 地图时间（小时粒度）：1 现实秒 ≈ speedIdx 游戏分钟
      g.minute += (dt * this.SPEEDS[this.speedIdx]) * 60 / 60;  // 转为分钟
      if (!g.minute) g.minute = 0;
      g.minute += dt * this.SPEEDS[this.speedIdx];
      while (g.minute >= 60) { g.minute -= 60; g.hour++; if (g.hour >= 24) { g.hour -= 24; g.day++; this.dayTick(g); } }

      // 玩家移动：转向+油门(惯量) + 洋流
      const turn = (this.keys['a'] ? 1 : 0) - (this.keys['d'] ? 1 : 0);
      const thr = (this.keys['w'] ? 1 : 0) - (this.keys['s'] ? 1 : 0);
      p.heading += turn * 0.6 * dt;
      const sp = 0.10; // 地图速度(单位/s)
      const pvx = Math.sin(p.heading) * thr * sp, pvy = -Math.cos(p.heading) * thr * sp;
      p.vel.x += (pvx - p.vel.x) * Math.min(1, 2.2 * dt);
      p.vel.y += (pvy - p.vel.y) * Math.min(1, 2.2 * dt);
      const rid = this.regionAt(p.pos), reg = REG[rid], cur = reg && reg.current;
      let cvx = 0, cvy = 0;
      if (cur && cur.strength > 0) { cvx = Math.sin(cur.dir) * cur.strength * 0.03; cvy = -Math.cos(cur.dir) * cur.strength * 0.03; }
      p.pos.x += (p.vel.x + cvx) * dt; p.pos.y += (p.vel.y + cvy) * dt;
      p.pos.x = Math.max(0.02, Math.min(0.98, p.pos.x)); p.pos.y = Math.max(0.02, Math.min(0.98, p.pos.y));
      // 油耗只看自身动力
      const eng = Math.hypot(p.vel.x, p.vel.y);
      p.fuel = Math.max(0, p.fuel - eng * 1.4 * dt * 6);

      // 部队/补给/水按"游戏小时"扣(这里每现实秒一次近似按分钟累计) —— 简化：每现实秒结算一次
      this.consumTick += dt;
      if (this.consumTick >= (60 / this.SPEEDS[this.speedIdx]) || this.SPEEDS[this.speedIdx] === 0) {
        this.consumTick = 0;
        const tier = W.WATER_TIERS.find(t => t.id === p.waterTier) || W.WATER_TIERS[1];
        p.supply = Math.max(0, p.supply - 0.06);
        p.water = Math.max(0, p.water - tier.per * 0.8);
        p.morale += tier.morale * 0.12 + (p.supply < 15 ? -3 : 0) + (p.water < 10 ? -5 : 0);
        p.morale = Math.max(0, Math.min(100, p.morale));
      }

      // 势力舰队移动（非最优：直行+噪声）
      for (const f of g.fleets) {
        const c = COL[f.target];
        const tx = LAYOUT[c.regionId].x + (Math.random() - 0.5) * 0.02, ty = LAYOUT[c.regionId].y + 0.02;
        const a = Math.atan2(tx - f.pos.x, ty - f.pos.y);
        const fvx = Math.sin(a) * 0.06 * (f.tpl.speed || 1) * dt * 8 + (Math.random() - 0.5) * 0.004;
        const fvy = Math.cos(a) * 0.06 * (f.tpl.speed || 1) * dt * 8 + (Math.random() - 0.5) * 0.004;
        f.pos.x += fvx; f.pos.y += fvy;
        if (Math.hypot(tx - f.pos.x, ty - f.pos.y) < 0.03) {
          f.stateT += dt;
          if (f.stateT > 2) { f.stateT = 0; f.target = COL[W.REGIONS[(W.REGIONS.indexOf(REG[c.regionId]) + 1) % W.REGIONS.length].id].id; }
        }
      }
      // 接战圈：玩家靠近某舰队 → 提示(可点)
      this.nearFleet = null;
      for (const f of g.fleets) if (Math.hypot(f.pos.x - p.pos.x, f.pos.y - p.pos.y) < 0.055) { this.nearFleet = f; break; }
    },
    dayTick(g) { /* 每日结算：事件/贸易/士气——骨架先留空 */ this.log(g, '第 ' + g.day + ' 天。'); },

    /* ---------- 输入 ---------- */
    bindInput() {
      window.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true; if (e.key.toLowerCase() === 'escape') this.closeMenu(); });
      window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
      this.canvas.addEventListener('mousedown', (e) => {
        const r = this.canvas.getBoundingClientRect();
        const mx = (e.clientX - r.left) / r.width, my = (e.clientY - r.top) / r.height;
        const p = this.game.player;
        if (this.nearFleet && Math.hypot((this.nearFleet.pos.x - mx), (this.nearFleet.pos.y - my)) < 0.06) this.openMenu(this.nearFleet);
        else this.log(this.game, '点击位置 (' + mx.toFixed(2) + ', ' + my.toFixed(2) + ')');
      });
    },
    closeMenu() { this.menuOpen = false; const el = document.getElementById('world-menu'); if (el) el.classList.add('hidden'); },
    openMenu(f) {
      this.menuOpen = true; this.sel = f;
      const el = document.getElementById('world-menu'); if (!el) return;
      const fid = W.FACTIONS[f.fid], tpl = f.tpl;
      let icon = '🚩';
      if (f.tplId === 'merchant') icon = '⚓'; if (f.tplId === 'raider') icon = '☠'; if (f.tplId === 'blackmarket') icon = '🕶'; if (f.tplId === 'customs' || f.tplId === 'army') icon = '🛡';
      el.querySelector('.wm-title').innerHTML = icon + ' ' + tpl.name + ' <span style="color:' + fid.color + '">(' + fid.name + ')</span>';
      el.querySelector('.wm-sub').textContent = '实力：' + tpl.ships.length + ' 舰 · 意图：' + tpl.intent;
      el.classList.remove('hidden');
    },
    action(act) {
      const f = this.sel, g = this.game;
      if (!f) return;
      if (act === 'auto') {
        const p = this.game.player;
        const ratio = (f.tpl.ships.length * 10 + 5) / 30;
        this.log(g, ratio > 1.2 ? '【自动战斗】对方明显更强，建议避战！' : ratio < 0.7 ? '【自动战斗】优势明显，对方被击溃（原型仅结算）。' : '【自动战斗】实力接近，结果未知（原型仅结算）。');
      } else if (act === 'trade' && (f.tplId === 'merchant' || f.tplId === 'industrial' || f.tplId === 'blackmarket')) {
        p.supply = Math.min(100, p.supply + 10); p.fuel = Math.min(100, p.fuel + 8);
        this.log(g, '【贸易】用补给/燃料换货，补了 10 补给 + 8 燃料（原型：交易跑商差价系统后续做）。');
      } else if (act === 'talk') { this.log(g, '【交谈】' + W.FACTIONS[f.fid].name + '舰长说："这年头，海上是生意，也是深渊。"'); }
      else if (act === 'intel') { this.log(g, '【情报】' + W.FACTIONS[f.fid].name + '近期在 ' + W.FACTIONS[f.fid].fleets[0] + ' 活动，传闻有黑市商队伪装。'); }
      else if (act === 'fight') { this.log(g, '【开战】进入战斗（战斗复用现有战场系统，原型稍后接入）。'); }
      this.closeMenu();
    },

    /* ---------- 渲染 ---------- */
    render() {
      const g = this.game, cv = this.canvas, ctx = this.ctx;
      const W2 = cv.width, H2 = cv.height;
      ctx.fillStyle = '#0a1830'; ctx.fillRect(0, 0, W2, H2);
      // 区域
      for (const rid in LAYOUT) {
        const L = LAYOUT[rid], reg = REG[rid], col = TERRAIN_COLOR[reg.terrain] || '#2a4a5a';
        ctx.fillStyle = col; ctx.beginPath();
        ctx.ellipse(L.x * W2, L.y * H2, 90, 70, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
        // 洋流箭头
        if (reg.current && reg.current.strength > 0) {
          ctx.save(); ctx.translate(L.x * W2, L.y * H2); ctx.rotate(reg.current.dir + Math.PI); ctx.fillStyle = 'rgba(120,220,255,0.8)';
          ctx.fillRect(-26, -1, 22, 2); ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(18, -4); ctx.lineTo(18, 4); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(reg.name, L.x * W2, L.y * H2 + 86);
        // 殖民地
        for (const cid of reg.colonies) {
          const c = COL[cid];
          ctx.fillStyle = c.traits && c.traits.length ? '#ffd27a' : '#9fe8b8';
          ctx.fillRect(L.x * W2 - 48 + Math.random() * 0, L.y * H2 - 42, 7, 7);
          ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(c.name, L.x * W2 - 36, L.y * H2 - 44);
        }
      }
      // 势力舰队
      for (const f of g.fleets) {
        const fcol = W.FACTIONS[f.fid].color;
        ctx.fillStyle = fcol; ctx.beginPath(); ctx.arc(f.pos.x * W2, f.pos.y * H2, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        if (f === this.nearFleet) { ctx.strokeStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(f.pos.x * W2, f.pos.y * H2, 10, 0, Math.PI * 2); ctx.stroke(); }
      }
      // 玩家舰队
      const p = g.player;
      ctx.save(); ctx.translate(p.pos.x * W2, p.pos.y * H2); ctx.rotate(p.heading);
      ctx.fillStyle = '#5ad1ff'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-7, -6); ctx.lineTo(-7, 6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('第 ' + g.day + ' 天 ' + ('0' + g.hour).slice(-2) + ':' + ('0' + Math.floor(g.minute)).slice(-2),
        W2 / 2, 14);
      // HUD 文本
      ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
      const tier = W.WATER_TIERS.find(t => t.id === p.waterTier) || W.WATER_TIERS[1];
      ctx.fillStyle = '#dff2ff';
      ctx.fillText('燃料 ' + Math.round(p.fuel) + ' ｜ 补给 ' + Math.round(p.supply) + ' ｜ 水 ' + Math.round(p.water) + '（' + tier.name + '）', 12, H2 - 14);
      ctx.fillText('士气 ' + Math.round(p.morale) + ' ｜ 船员 ' + p.crew, 12, H2 - 30);
      if (this.nearFleet) { ctx.fillStyle = '#ffd27a'; ctx.fillText('与 ' + W.FACTIONS[this.nearFleet.fid].name + ' ' + W.FLEET_TEMPLATES[this.nearFleet.tplId].name + ' 接近 — 点击它进入交互', W2 / 2, H2 - 14); }
    },
    log(g, s) { g.log.unshift('[' + ('0' + g.hour).slice(-2) + ':00] ' + s); if (g.log.length > 30) g.log.pop(); const el = document.getElementById('world-log'); if (el) el.innerHTML = g.log.slice(0, 12).map(x => '<div>' + x + '</div>').join(''); }
  };
  WorldApp.consumTick = 0;
  globalThis.WorldMap = WorldApp;
})();
