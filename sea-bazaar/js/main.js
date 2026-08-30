/* ============================================================
   入口：存档封装 / 屏幕路由 / 主菜单
   ============================================================ */
(function () {
  'use strict';

  const Store = {
    ok: (() => {
      try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
      catch (e) { return false; }
    })(),
    get(k, def) {
      if (!this.ok) return def;
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : def;
      } catch (e) { return def; }
    },
    set(k, v) {
      if (!this.ok) return;
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 忽略 */ }
    },
    remove(k) {
      if (!this.ok) return;
      try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ }
    }
  };
  globalThis.Store = Store;

  const TUT_STEPS = [
    { t:'基本操作', s:'按 <b>W/S</b> 前进/倒车，<b>A/D</b> 转向，<b>Q/E</b> 横推（前进最快、倒车其次、横推最慢）。' },
    { t:'基本操作', s:'<b>左键</b> 开火 · 按住<b>右键</b> 自动航向 · <b>滚轮</b> 缩放 · <b>空格</b> 暂停。' },
    { t:'基本操作', s:'<b>1~5</b> 选武器组 · <b>F</b> 组自动开火 · <b>Tab/R</b> 锁敌 · <b>6/7/8</b> 用消耗品 · <b>X</b> 开关护盾。' },
    { t:'热量机制', s:'开火/护盾维持产生<b>热量</b>（散热可排）；护盾承伤累积<b>淤热</b>（须关盾且热量散尽后才退）。' },
    { t:'热量机制', s:'热容触顶 → <b>指挥过载</b>：火力失能、护盾不再吸收，<b>仍可移动</b>。' },
    { t:'热量机制', s:'<b>V</b> 主动散热：不可中断、强制关盾+停火，持续到<b>完全冷却</b>（高风险高收益）。' },
    { t:'复杂操作', s:'伤害类型：<b>动能拆盾</b>(对盾×2) · <b>高爆撕甲</b>(对甲×2) · <b>破片</b>打裸船 · <b>光束</b>通吃。' },
    { t:'复杂操作', s:'<b>鱼雷</b>走深水（吃水不足免疫、光束可拦）；<b>导弹</b>空中目标（近防可拦）。' },
    { t:'复杂操作', s:'炮塔需旋转对准（<b>提前量</b>）才开火，大口径转得慢。' },
    { t:'复杂操作', s:'改装页可装武器/插件、调校散热热容护盾、<b>1~5</b> 分组设自动开火。' },
    { t:'完成', s:'教程到此结束，祝你远征顺利！' }
  ];
  const TutApp = {
    idx: 0,
    open(i) { this.idx = i || 0; document.getElementById('overlay-tutorial').classList.remove('hidden'); this.render(); },
    close() { document.getElementById('overlay-tutorial').classList.add('hidden'); },
    render() {
      const st = TUT_STEPS[this.idx];
      document.getElementById('tut-progress').textContent = (this.idx+1) + '/' + TUT_STEPS.length + ' · ' + st.t;
      document.getElementById('tut-body').innerHTML = '<h3 style="margin:0 0 8px">' + st.t + '</h3><p style="line-height:1.8;margin:0">' + st.s + '</p>';
      document.getElementById('btn-tut-prev').disabled = this.idx === 0;
      document.getElementById('btn-tut-next').textContent = this.idx === TUT_STEPS.length-1 ? '完成 ✓' : '下一步 →';
    },
    next() { if (this.idx < TUT_STEPS.length-1) { this.idx++; this.render(); } else this.close(); },
    prev() { if (this.idx > 0) { this.idx--; this.render(); } },
    init() {
      document.getElementById('btn-tut-prev').onclick = () => TutApp.prev();
      document.getElementById('btn-tut-next').onclick = () => TutApp.next();
      document.getElementById('btn-tutorial-close').onclick = () => TutApp.close();
    }
  };
  globalThis.TutApp = TutApp;
  const MainApp = {
    show(name) {
      const screens = { menu: 'screen-menu', run: 'screen-run', battle: 'screen-battle' };
      for (const id in screens) {
        document.getElementById(screens[id]).classList.toggle('hidden', screens[id] !== screens[name]);
      }
      if (name !== 'battle') document.getElementById('hud').classList.add('hidden');
      document.getElementById('overlay-help').classList.add('hidden');
      document.getElementById('overlay-result').classList.add('hidden');
      document.getElementById('overlay-pause').classList.add('hidden');
    },

    updateMenu() {
      const meta = Store.get('sb_meta', {});
      const hasRun = !!Store.get('sb_run');
      const btn = document.getElementById('btn-run-continue');
      btn.disabled = !hasRun;
      btn.textContent = hasRun ? '继续远征' : '继续远征（无存档）';
      const el = document.getElementById('menu-meta');
      const best = meta.bestDay || 1;
      el.textContent = '最远航程 第 ' + best + ' 天 · 最高分 ' + (meta.bestScore || 0) + ' · 远征 ' + (meta.runs || 0) + ' 次 · 胜利 ' + (meta.wins || 0) + ' 次';
    },

    init() {
      const st = Store.get('ns_settings', {});
      AudioFx.enabled = st.sound !== false;
      const soundBtn = document.getElementById('btn-sound');
      const updateSoundBtn = () => { soundBtn.textContent = '音效：' + (AudioFx.enabled ? '开' : '关'); };
      updateSoundBtn();
      soundBtn.addEventListener('click', () => {
        AudioFx.init();
        AudioFx.setEnabled(!AudioFx.enabled);
        const s2 = Store.get('ns_settings', {});
        s2.sound = AudioFx.enabled;
        Store.set('ns_settings', s2);
        updateSoundBtn();
      });

      RunApp.init();
      Renderer.registerShipSprites(['battleship','hammer','destroyer','lightCruiser','heavyCruiser','catamaran','cross','lship','carrier']);
      document.getElementById('btn-run-new').addEventListener('click', () => RunApp.newRun());
      document.getElementById('btn-tutorial-battle').addEventListener('click', () => RunApp.startTutorial());
      document.getElementById('btn-run-continue').addEventListener('click', () => RunApp.continueRun());
      document.getElementById('btn-help').addEventListener('click', () => {
        document.getElementById('overlay-help').classList.remove('hidden');
      });
      document.getElementById('btn-help-close').addEventListener('click', () => {
        document.getElementById('overlay-help').classList.add('hidden');
      });
      TutApp.init();
      const tb = document.getElementById('btn-tutorial');
      if (tb) tb.addEventListener('click', () => TutApp.open(0));
      if (!Store.get('sb_tut')) { Store.set('sb_tut', 1); TutApp.open(0); }

      // 调试直达：?view=refit 直接开一局并进入改装界面
      const urlView = (typeof location !== 'undefined' && typeof URLSearchParams !== 'undefined')
        ? new URLSearchParams(location.search).get('view') : null;
      if (urlView === 'refit') {
        RunApp.newRun();
        RunApp.openRefit();
        return;
      }

      this.updateMenu();
      this.show('menu');
    }
  };

  globalThis.MainApp = MainApp;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MainApp.init());
  } else {
    MainApp.init();
  }
})();
