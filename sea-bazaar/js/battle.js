/* ============================================================
   战斗界面：渲染循环 / 输入 / HUD / 小地图 / 暂停与结算
   ============================================================ */
(function () {
  'use strict';

  const U = Util, D = Data;

  const BattleTutorial = {
    sections: [
      { title:'① 基本操作', items:[
        { id:'w', label:'按 W 前进', keys:['w'] },
        { id:'ad', label:'A/D 转向', keys:['a','d'] },
        { id:'qe', label:'Q/E 横推', keys:['q','e'] }
      ]},
      { title:'② 战斗', items:[
        { id:'fire', label:'左键 开火' },
        { id:'lock', label:'Tab / R 锁定目标', keys:['tab','r'] }
      ]},
      { title:'③ 护盾 & 散热', note:'护盾吸收伤害→<b>热量</b>(散热可排)；护盾硬损伤累积<b>淤热</b>(须关盾且热量散尽才退)。伤害类型×护盾：<b>动能×2</b> · 高爆×0.5 · 破片×0.25 · 光束×1；对甲反之。', items:[
        { id:'x', label:'X 开启损管护盾', keys:['x'] },
        { id:'v', label:'V 主动散热', keys:['v'] }
      ]},
      { title:'④ 武器组', items:[
        { id:'grp', label:'1~5 切武器组 / F 自动开火', keys:['1','2','3','4','5','f'] }
      ]}
    ],
    sec: 0, active: false, done: {},
    start() { this.sec = 0; this.active = true; this.done = {}; const el = document.getElementById('hud-tutorial'); if (el) el.classList.remove('hidden'); this.init(); this.render(); },
    stop() { this.active = false; const el = document.getElementById('hud-tutorial'); if (el) el.classList.add('hidden'); },
    cur() { return this.sections[this.sec]; },
    mark(k) {
      if (!this.active) return;
      const sec = this.cur(); if (!sec) return;
      for (const it of sec.items) {
        if (it.keys && it.keys.indexOf(k) >= 0) this.done[it.id] = true;
      }
      if (k === 'fire') this.done.fire = true;
      this.render();
    },
    allDone() { const sec = this.cur(); return sec && sec.items.every(it => this.done[it.id]); },
    check(g) {
      if (!this.active) return;
      if (this.allDone()) {
        this.sec++;
        if (this.sec >= this.sections.length) { this.stop(); const o = document.getElementById('overlay-tutdone'); if (o) o.classList.remove('hidden'); }
        else { this.render(); this.enterSec(g); }
      }
    },
    enterSec(g) {
      if (!g || !g.tutorialVolley) return;
      const sec = this.cur();
      if (sec && sec.title.indexOf('护盾') >= 0) g.tutorialVolley();
    },
    init() {
      const b = document.getElementById('btn-tutdone-exit');
      if (b) b.onclick = () => { const o = document.getElementById('overlay-tutdone'); if (o) o.classList.add('hidden'); BattleApp.finish(false, 'result'); };
    },
    render() {
      const sec = this.cur(); if (!sec) return;
      const el = document.getElementById('hud-tutorial'); if (!el) return;
      let h = '<div class="tut-title">' + sec.title + '</div>';
      if (sec.note) h += '<div class="tut-note">' + sec.note + '</div>';
      h += '<div class="tut-items">';
      for (const it of sec.items) {
        const v = !!this.done[it.id];
        h += '<div class="tut-item' + (v ? ' ok' : '') + '">' + (v ? '<b>✓</b>' : '○') + ' ' + it.label + '</div>';
      }
      h += '</div>';
      el.innerHTML = h;
    },
    position() {
      const el = document.getElementById('hud-tutorial');
      const g = BattleApp.game;
      if (!this.active || !el || !g || !g.player || !g.player.alive) return;
      const sx = (g.player.x - g.camera.x) * g.camera.zoom + g.viewW / 2;
      const sy = (g.player.y - g.camera.y) * g.camera.zoom + g.viewH / 2;
      const off = (g.player.hullDef.beam * g.camera.zoom * 0.75 + 34);
      el.style.left = sx + 'px';
      el.style.top = (sy + off) + 'px';
    }
  };
  globalThis.BattleTutorial = BattleTutorial;
  const BattleApp = {
    game: null,
    cfg: null,
    raf: 0,
    lastT: 0,
    hudT: 0,
    miniT: 0,
    keys: {},
    finished: false,
    pausedByKey: false,

    /* ---------------- 生命周期 ---------------- */
    start(cfg) {
      AudioFx.init();
      AudioFx.resume();
      this.cfg = cfg;
      this.finished = false;
      this.keys = {};
      this.game = new GameCore.Game(cfg);
      if (cfg.tutorial) BattleTutorial.start();
      this.game.input.zoom = 1;
      MainApp.show('battle');
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

      const canvas = document.getElementById('battle-canvas');
      this.resize();
      window.addEventListener('resize', this.onResize);
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('blur', this.onBlur);
      canvas.addEventListener('mousedown', this.onMouseDown);
      window.addEventListener('mouseup', this.onMouseUp);
      window.addEventListener('mousemove', this.onMouseMove);
      canvas.addEventListener('wheel', this.onWheel);
      canvas.addEventListener('contextmenu', this.onCtxMenu);

      this.bindOverlays();
      this.buildGroupsHUD();
      this.buildConsumablesHUD();
      this.resetFeed();
      this.updateHullBar();
      this.updateGroupsHUD();
      this.updateConsumablesHUD();
      this.tipsT = 14;

      // 远征模式按钮与提示
      const hasCons = cfg.consumables && cfg.consumables.some(c => !!c);
      document.getElementById('hud-consumables').classList.toggle('hidden', !hasCons);
      const tips = document.getElementById('hud-tips');
      tips.innerHTML =
        '<b>W/S</b> 前进/倒车 · <b>A/D</b> 转向 · <b>Q/E</b> 横推 · <b>按住右键</b> 自动航向 · <b>左键</b> 开火 · <b>1~5</b> 选组 · <b>F</b> 组自动开火 · <b>V</b> 散热 · <b>Tab/R</b> 锁敌 · <b>空格</b> 暂停 · <b>滚轮</b> 缩放' +
        (hasCons ? ' · <b>6/7/8</b> 消耗品' : '');
      tips.classList.remove('faded');

      document.getElementById('overlay-result').classList.add('hidden');
      document.getElementById('overlay-pause').classList.add('hidden');
      document.getElementById('hud').classList.remove('hidden');

      this.lastT = performance.now();
      const loop = (t) => this.loop(t);
      this.raf = requestAnimationFrame(loop);
    },

    stop() {
      cancelAnimationFrame(this.raf);
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.onBlur);
      const canvas = document.getElementById('battle-canvas');
      canvas.removeEventListener('mousedown', this.onMouseDown);
      window.removeEventListener('mouseup', this.onMouseUp);
      window.removeEventListener('mousemove', this.onMouseMove);
      canvas.removeEventListener('wheel', this.onWheel);
      canvas.removeEventListener('contextmenu', this.onCtxMenu);
      this.game = null;
    },

    /** 结束战斗并通知远征层（won: 是否胜利, reason: result/retreat/abandon） */
    finish(won, reason) {
      const cb = this.cfg && this.cfg.onExit;
      const g = this.game;
      this.stop();
      if (cb) cb(won, reason || 'result', g);
    },

    exit(saveRefit) {
      this.stop();
    },

    /* ---------------- 主循环 ---------------- */
    loop(t) {
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      const game = this.game;
      if (!game) return;
      game.update(dt);
      BattleTutorial.check(game);
      this.render();
      BattleTutorial.position();
      this.updateHUD(dt);
      if (game.over && game.overT > 2.2 && !this.finished) {
        this.finished = true;
        this.showResult();
      }
      this.raf = requestAnimationFrame((ts) => this.loop(ts));
    },

    render() {
      const canvas = document.getElementById('battle-canvas');
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Renderer.draw(ctx, this.game);
    },

    resize() {
      const canvas = document.getElementById('battle-canvas');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      if (this.game) {
        this.game.viewW = window.innerWidth;
        this.game.viewH = window.innerHeight;
      }
    },

    /* ---------------- 输入 ---------------- */
    onResize: () => { BattleApp.resize(); },
    onCtxMenu: (e) => { e.preventDefault(); },
    onBlur: () => {
      const g = BattleApp.game;
      BattleApp.keys = {};
      if (g) {
        g.input.throttle = 0;
        g.input.rudder = 0;
        g.input.fire = false;
        g.input.autoHelm = false;
      }
    },

    screenToWorld(sx, sy) {
      const g = BattleApp.game;
      return {
        x: (sx - g.viewW / 2) / g.camera.zoom + g.camera.x,
        y: (sy - g.viewH / 2) / g.camera.zoom + g.camera.y
      };
    },

    onMouseDown: (e) => {
      const g = BattleApp.game;
      if (!g || BattleApp.finished) return;
      if (e.button === 0) {
        g.input.fire = true;
        BattleTutorial.mark('fire');
        // 点击敌舰 → 锁定目标
        const w = BattleApp.screenToWorld(e.clientX, e.clientY);
        for (const s of g.ships) {
          if (s.team === 'enemy' && s.alive && U.dist(w.x, w.y, s.x, s.y) < s.radius + 10) {
            g.playerTarget = s;
            break;
          }
        }
      } else if (e.button === 2) {
        g.input.autoHelm = true;
      }
    },
    onMouseUp: (e) => {
      const g = BattleApp.game;
      if (!g) return;
      if (e.button === 0) g.input.fire = false;
      if (e.button === 2) g.input.autoHelm = false;
    },
    onMouseMove: (e) => {
      const g = BattleApp.game;
      if (!g) return;
      const w = BattleApp.screenToWorld(e.clientX, e.clientY);
      g.input.aimX = w.x;
      g.input.aimY = w.y;
    },
    onWheel: (e) => {
      const g = BattleApp.game;
      if (!g) return;
      e.preventDefault();
      const z = U.clamp(g.input.zoom * (e.deltaY < 0 ? 1.1 : 0.91), 0.55, 1.7);
      g.input.zoom = z;
    },

    onKeyDown: (e) => {
      const g = BattleApp.game;
      if (!g) return;
      const k = e.key.toLowerCase();
      BattleTutorial.mark(k);
      // 开关类按键忽略自动重复
      if (e.repeat && [' ', 'escape', 'f', 'tab', 'r', 'v', 'x', 'z'].indexOf(k) >= 0) {
        e.preventDefault();
        return;
      }
      BattleApp.keys[k] = true;
      const inp = g.input;
      // 移动键
      if (k === 'w' || k === 's') {
        inp.throttle = (BattleApp.keys['w'] ? 1 : 0) + (BattleApp.keys['s'] ? -1 : 0);
      }
      if (k === 'a' || k === 'd') {
        inp.rudder = (BattleApp.keys['d'] ? 1 : 0) + (BattleApp.keys['a'] ? -1 : 0);
      }
      if (k === 'q' || k === 'e') {
        inp.strafe = (BattleApp.keys['q'] ? 1 : 0) + (BattleApp.keys['e'] ? -1 : 0);
      }
      // 武器组
      if (k >= '1' && k <= '5') {
        inp.selectedGroup = parseInt(k, 10);
        BattleApp.updateGroupsHUD();
      }
      // 消耗品
      if (k >= '6' && k <= '8') {
        if (!e.repeat && g.useConsumable(parseInt(k, 10) - 6)) {
          BattleApp.updateConsumablesHUD();
        }
      }
      if (k === 'f') {
        BattleApp.toggleGroupAuto(inp.selectedGroup);
      }
      if (k === 'v') {
        g.playerVentRequest();
        e.preventDefault();
      }
      if (k === 'x') {
        if (g.player && g.player.alive) {
          const on = g.player.toggleShield();
          g.msg('损管护盾：' + (on ? '开启' : '关闭'), 'feed-info');
          BattleApp.updateHUD(0);
        }
        e.preventDefault();
      }
      if (k === 'tab') {
        g.cycleTarget();
        e.preventDefault();
      }
      if (k === 'r') {
        g.targetNearest();
      }
      if (k === 'z' && g.player && g.player.bays && g.player.bays.length) {
        g.player.launchMode = !g.player.launchMode;
        g.msg('载机：' + (g.player.launchMode ? '出击' : '返航收队'), 'feed-info');
        e.preventDefault();
      }
      if (k === ' ' || k === 'escape') {
        if (!BattleApp.finished) BattleApp.togglePause();
        e.preventDefault();
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].indexOf(k) >= 0) e.preventDefault();
    },

    onKeyUp: (e) => {
      const g = BattleApp.game;
      if (!g) return;
      const k = e.key.toLowerCase();
      BattleApp.keys[k] = false;
      const inp = g.input;
      if (k === 'w' || k === 's') {
        inp.throttle = (BattleApp.keys['w'] ? 1 : 0) + (BattleApp.keys['s'] ? -1 : 0);
      }
      if (k === 'a' || k === 'd') {
        inp.rudder = (BattleApp.keys['d'] ? 1 : 0) + (BattleApp.keys['a'] ? -1 : 0);
      }
      if (k === 'q' || k === 'e') {
        inp.strafe = (BattleApp.keys['q'] ? 1 : 0) + (BattleApp.keys['e'] ? -1 : 0);
      }
    },

    toggleGroupAuto(i) {
      const g = BattleApp.game;
      const s = g.player;
      if (!s || !s.alive) return;
      const group = s.groups[i];
      if (!group) return;
      group.auto = !group.auto;
      // 写回装配对象 → 战斗结束后持久化
      const lo = g.cfg.loadout;
      if (lo && lo.groups && lo.groups[i]) lo.groups[i].auto = group.auto;
      BattleApp.updateGroupsHUD();
      sndFx('whoosh');
    },

    togglePause() {
      const g = BattleApp.game;
      if (!g) return;
      g.paused = !g.paused;
      const ov = document.getElementById('overlay-pause');
      if (g.paused) ov.classList.remove('hidden');
      else ov.classList.add('hidden');
    },

    /* ---------------- 覆盖层 ---------------- */
    bindOverlays() {
      const once = (id, fn) => {
        const el = document.getElementById(id);
        const h = () => { fn(); };
        el.onclick = h;
      };
      once('btn-resume', () => BattleApp.togglePause());
      once('btn-pause-retreat', () => BattleApp.finish(false, 'retreat'));
      once('btn-pause-menu', () => BattleApp.finish(false, 'abandon'));
      once('btn-again', () => BattleApp.finish(BattleApp.game.over === 'victory', 'result'));
      once('btn-vent', () => { BattleApp.game.playerVentRequest(); });
      once('btn-shield', () => {
        const g = BattleApp.game;
        if (g && g.player && g.player.alive) {
          const on = g.player.toggleShield();
          g.msg('损管护盾：' + (on ? '开启' : '关闭'), 'feed-info');
          BattleApp.updateHUD(0);
        }
      });
      once('btn-pause', () => BattleApp.togglePause());
    },

    /* ---------------- 消耗品 HUD ---------------- */
    buildConsumablesHUD() {
      const el = document.getElementById('hud-consumables');
      el.innerHTML = '';
      const cons = this.cfg.consumables || [];
      for (let i = 0; i < 3; i++) {
        const b = document.createElement('button');
        b.className = 'btn btn-tiny hcons';
        b.dataset.idx = i;
        b.addEventListener('click', () => {
          const g = BattleApp.game;
          if (g && g.useConsumable(i)) BattleApp.updateConsumablesHUD();
        });
        el.appendChild(b);
      }
    },
    updateConsumablesHUD() {
      const g = this.game;
      if (!g) return;
      const cons = this.cfg.consumables || [];
      const btns = document.querySelectorAll('#hud-consumables .hcons');
      btns.forEach((b) => {
        const i = parseInt(b.dataset.idx, 10);
        const id = cons[i];
        if (!id) {
          b.textContent = (i + 1) + '. 空';
          b.classList.add('empty');
          b.disabled = true;
        } else if (g.usedConsumables[i]) {
          b.textContent = (i + 1) + '. 已用';
          b.classList.add('used');
          b.disabled = true;
        } else {
          const d = D.CONSUMABLES[id];
          b.textContent = (i + 1) + '. ' + (d ? d.name : id);
          b.classList.remove('empty', 'used');
          b.disabled = false;
        }
      });
    },

    showResult() {
      const g = this.game;
      const ov = document.getElementById('overlay-result');
      const title = document.getElementById('result-title');
      const won = g.over === 'victory';
      title.textContent = won ? '胜 利' : '战 败';
      title.className = won ? 'victory' : 'defeat';
      const dur = Math.round(g.time);
      const mm = Math.floor(dur / 60), ss = (dur % 60).toString().padStart(2, '0');
      document.getElementById('result-stats').innerHTML =
        '击沉敌舰 <b>' + g.stats.enemiesSunk + '</b> 艘<br>' +
        '我方损失 <b>' + g.stats.alliesLost + '</b> 艘<br>' +
        '你的输出伤害 <b>' + Math.round(g.stats.playerDamage) + '</b><br>' +
        '旗舰承受伤害 <b>' + Math.round(g.stats.playerTaken) + '</b><br>' +
        '战斗用时 <b>' + mm + ':' + ss + '</b>';
      document.getElementById('btn-again').textContent = '返回航线 →';
      ov.classList.remove('hidden');
      this.updateHUD(0);
    },

    /* ---------------- HUD ---------------- */
    updateHUD(dt) {
      const g = this.game;
      if (!g) return;
      const s = g.player;
      this.tipsT -= dt;
      if (this.tipsT <= 0) document.getElementById('hud-tips').classList.add('faded');
      if (!s) return;

      // 船体/装甲/热量/航速
      const hullPct = Math.max(0, s.hull / s.hullMax);
      const armorPct = Math.max(0, s.armor / s.armorMax);
      const heatPct = Math.min(1, s.heat / s.heatCap);
      document.getElementById('bar-hull-fill').style.width = (hullPct * 100) + '%';
      document.getElementById('bar-hull-text').textContent = Math.round(hullPct * 100) + '%';
      document.getElementById('bar-armor-fill').style.width = (armorPct * 100) + '%';
      // 损管护盾（开关 + 硬损伤占用）
      const dcWrap = document.getElementById('hud-dc-wrap');
      const dcFill = document.getElementById('bar-dc-fill');
      const dcText = document.getElementById('bar-dc-text');
      if (s.shield) {
        dcWrap.classList.remove('hidden');
        const hardPct = Math.min(1, s.shield.hard / s.heatCap);
        dcFill.style.width = (hardPct * 100) + '%';
        dcFill.style.background = s.shield.on
          ? 'linear-gradient(90deg, #5ae0c8, #2fbf9f)'
          : 'linear-gradient(90deg, #7a8290, #5a6270)';
        dcText.textContent = (s.shield.on ? '护盾开' : '护盾关') + ' · 硬损 ' + Math.round(hardPct * 100) + '%';
      } else {
        dcWrap.classList.add('hidden');
      }
      // 热量条上的硬损伤占用（单独颜色）
      const hardEl = document.getElementById('bar-heat-hard');
      if (hardEl) {
        hardEl.style.width = (s.shield ? Math.min(100, (s.shield.hard / s.heatCap) * 100) : 0) + '%';
      }
      const heatFill = document.getElementById('bar-heat-fill');
      heatFill.style.width = (heatPct * 100) + '%';
      document.getElementById('bar-heat-text').textContent = Math.round(heatPct * 100) + '%';
      const heatBar = document.querySelector('.bar-heat');
      if (heatPct > 0.85 || s.overloaded()) heatBar.classList.add('hot'); else heatBar.classList.remove('hot');
      const sp = Math.hypot(s.vx, s.vy);
      document.getElementById('bar-speed-fill').style.width = Math.min(100, (sp / s.maxSpeed) * 100) + '%';
      document.getElementById('bar-speed-text').textContent = D.knots(sp) + ' 节';

      // 状态标签
      const stEl = document.getElementById('hud-status');
      const tags = [];
      if (s.vent.active) tags.push('<span class="st st-vent">◉ 散热中</span>');
      else if (s.vent.lock > 0) tags.push('<span class="st st-vent">◌ 散热恢复</span>');
      if (s.overloaded()) tags.push('<span class="st st-hot">⚠ 指挥过载</span>');
      else if (heatPct > 0.85) tags.push('<span class="st st-warn">♨ 高温</span>');
      if (!s.alive) tags.push('<span class="st st-hot">✝ 沉没中</span>');
      if (s.hull / s.hullMax < 0.4 && s.alive) tags.push('<span class="st st-warn">⚠ 动力受损</span>');
      stEl.innerHTML = tags.join('');
      document.getElementById('hud-ship-name').textContent = s.name;
      document.getElementById('hud-ship-class').textContent = s.hullDef.cls;

      // 分组 HUD 低频刷新
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.12;
        this.updateGroupsHUD();
      }
      // 目标面板
      this.miniT -= dt;
      if (this.miniT <= 0) {
        this.miniT = 0.12;
        this.updateTargetHUD();
        this.updateMinimap();
        this.updateFeed();
      }
    },

    buildGroupsHUD() {
      const el = document.getElementById('hud-groups');
      el.innerHTML = '';
      for (let i = 1; i <= 5; i++) {
        const box = document.createElement('div');
        box.className = 'hgroup';
        box.dataset.group = i;
        box.addEventListener('click', (e) => {
          const g = BattleApp.game;
          if (!g) return;
          if (e.target.closest('.ga')) {
            BattleApp.toggleGroupAuto(i);
          } else {
            g.input.selectedGroup = i;
            BattleApp.updateGroupsHUD();
          }
        });
        el.appendChild(box);
      }
    },

    updateGroupsHUD() {
      const g = this.game;
      if (!g) return;
      const s = g.player;
      if (!s) return;
      const boxes = document.querySelectorAll('#hud-groups .hgroup');
      boxes.forEach((box) => {
        const i = parseInt(box.dataset.group, 10);
        const group = s.groups[i];
        box.classList.toggle('selected', g.input.selectedGroup === i);
        let html = '<div class="gh"><span class="gn">' + i + '</span>';
        html += '<span class="ga ' + (group.auto ? 'ga-auto' : 'ga-manual') + '">' + (group.auto ? 'AUTO' : '手动') + '</span></div>';
        html += '<div class="gw">';
        for (const w of group.weapons) {
          const ready = w.ready() && !s.vent.active && s.vent.lock <= 0 && g.canFireHeat(w);
          const cls = 'wi kind-' + (w.def.kind === 'beam' ? 'beam' : (w.def.mount === 'missile' ? 'missile' : 'gun'));
          html += '<span class="' + cls + (ready ? ' ready' : ' cooling') + '" title="' + w.def.name + '">' +
            (w.def.name.length > 6 ? w.def.name.slice(0, 6) : w.def.name) +
            (w.ammo !== Infinity ? ' <span class="ammo">×' + w.ammo + '</span>' : '') + '</span>';
        }
        if (!group.weapons.length) html += '<span style="font-size:9px;color:var(--text-dim)">空</span>';
        html += '</div>';
        box.innerHTML = html;
      });
    },

    updateTargetHUD() {
      const g = this.game;
      const el = document.getElementById('target-info');
      const t = g.playerTarget;
      const s = g.player;
      if (!t || !t.alive || !s) {
        el.innerHTML = '<span style="color:var(--text-dim)">未锁定目标（Tab / R 或点击敌舰）</span>';
        return;
      }
      const dist = Math.round(U.dist(s.x, s.y, t.x, t.y));
      const pct = Math.max(0, t.hull / t.hullMax);
      el.innerHTML =
        '<div class="target-name">' + t.name + '<span class="cls">' + t.hullDef.cls + '</span></div>' +
        '<div>距离 <b style="color:#fff">' + dist + 'm</b> · 航速 <b style="color:#fff">' + D.knots(Math.hypot(t.vx, t.vy)) + '</b>节</div>' +
        '<div class="bar bar-hull" style="margin-top:4px"><div class="bar-fill" style="width:' + (pct * 100) + '%;background:linear-gradient(90deg,#a03a3a,#e05a5a)"></div></div>' +
        '<div>船体 <b>' + Math.round(t.hull) + '</b> / ' + Math.round(t.hullMax) + ' · 装甲 <b>' + Math.round(t.armor) + '</b></div>';
    },

    updateFeed() {
      const g = this.game;
      const el = document.getElementById('hud-feed');
      let html = '';
      for (const m of g.messages) {
        const cls = m.t > 4.6 ? ' fading' : '';
        html += '<div class="feed-item ' + (m.cls || '') + cls + '">' + m.text + '</div>';
      }
      if (el.innerHTML !== html) el.innerHTML = html;
    },

    resetFeed() {
      document.getElementById('hud-feed').innerHTML = '';
      document.getElementById('target-info').innerHTML = '';
    },

    updateHullBar() {
      // 占位：初始化血量条为满
      document.getElementById('bar-hull-fill').style.width = '100%';
      document.getElementById('bar-armor-fill').style.width = '100%';
    },

    updateMinimap() {
      const g = this.game;
      const cv = document.getElementById('minimap');
      const ctx = cv.getContext('2d');
      const w = cv.width, h = cv.height;
      const sc = Math.min(w / g.worldW, h / g.worldH);
      const ox = (w - g.worldW * sc) / 2;
      const oy = (h - g.worldH * sc) / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(4,14,28,0.92)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,120,90,0.4)';
      ctx.strokeRect(ox, oy, g.worldW * sc, g.worldH * sc);
      // 视口
      const vw = g.viewW / g.camera.zoom, vh = g.viewH / g.camera.zoom;
      const vx = (g.camera.x - vw / 2) * sc + ox;
      const vy = (g.camera.y - vh / 2) * sc + oy;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.max(ox, vx), Math.max(oy, vy), Math.min(vw * sc, g.worldW * sc), Math.min(vh * sc, g.worldH * sc));
      // 舰船
      for (const s of g.ships) {
        const px = s.x * sc + ox, py = s.y * sc + oy;
        ctx.beginPath();
        if (s.isPlayer) {
          ctx.fillStyle = '#ffffff';
          ctx.arc(px, py, 4, 0, U.TAU);
          ctx.fill();
          ctx.strokeStyle = '#5ad1ff';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        } else if (s.team === 'ally') {
          ctx.fillStyle = '#5ab8e8';
          ctx.arc(px, py, 3, 0, U.TAU);
          ctx.fill();
        } else {
          ctx.fillStyle = '#e05a5a';
          ctx.arc(px, py, 3, 0, U.TAU);
          ctx.fill();
        }
      }
      // 锁定的目标闪烁
      const t = g.playerTarget;
      if (t && t.alive) {
        ctx.strokeStyle = 'rgba(255,200,90,' + (0.5 + 0.5 * Math.abs(Math.sin(g.time * 6))) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(t.x * sc + ox, t.y * sc + oy, 6, 0, U.TAU);
        ctx.stroke();
      }
    }
  };

  function sndFx(name, arg) {
    if (AudioFx && AudioFx[name]) AudioFx[name](arg);
  }

  globalThis.BattleApp = BattleApp;
})();
