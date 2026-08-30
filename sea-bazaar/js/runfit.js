/* ============================================================
   仓库（背包）页面 + 改装页面（旗舰 / 僚舰）
   Bazaar 式物品管理：装备 / 卸下 / 遗物 / 僚舰 / 消耗品 / 出售 / 丢弃
   ============================================================ */
(function () {
  'use strict';

  const U = Util, D = Data;
  const SIZE_RANK = { small: 0, medium: 1, large: 2 };
  const SIZE_LABEL = { small: '小型', medium: '中型', large: '大型' };
  const TYPE_LABEL = { turret: '炮塔位', fixed: '固定位', missile: '导弹位', bay: '机库位' };
  const KIND_LABEL = { gun: '火炮', beam: '光束', torpedo: '鱼雷', missile: '导弹', bolt: '能量', fighter: '载机' };
  const KIND_CLS = { gun: 'gun', beam: 'beam', torpedo: 'missile', missile: 'missile', bolt: 'beam', fighter: 'missile' };
  const DTYPE_LABEL = { he: '高爆', kin: '动能', frag: '破片', beam: '光束' };
  const PERSONAS = [
    { id: 'reckless', name: '鲁莽' },
    { id: 'aggressive', name: '激进' },
    { id: 'steady', name: '稳健' },
    { id: 'cautious', name: '谨慎' },
    { id: 'timid', name: '怯懦' }
  ];

  /* ---------- 通用物品详情(种类/槽位/数值/OP) ---------- */
  function itemDetailHtml(it) {
    const def = it.def;
    const rcol = D.RARITY_COLOR[it.rarity];
    let head = '<b style="color:' + rcol + '">' + D.ITEM_ICON[it.type] + ' ' + def.name + '</b>' +
      '<span class="hint"> [' + D.RARITY_LABEL[it.rarity] + ']</span>';
    let meta = '';
    if (it.type === 'weapon') {
      const slotTxt = { turret:'炮塔位', fixed:'固定位', missile:'导弹位', bay:'机库位' }[def.mount] || '';
      meta = KIND_LABEL[def.kind] + ' · ' + SIZE_LABEL[def.size] + slotTxt + '<br>' + RefitApp.weaponStatsHtml(def) + '<br>OP <b>' + def.op + '</b>';
    } else if (it.type === 'hullmod') { meta = '舰船插件 · OP <b>' + def.op + '</b>'; }
    else if (it.type === 'upgrade') { meta = '永久强化芯片'; }
    else if (it.type === 'relic') { meta = '遗物'; }
    else if (it.type === 'consumable') { meta = '战斗消耗品'; }
    else if (it.type === 'escort') { const c = D.ESCORT_CARDS[def.cardId]; meta = '僚舰卡' + (c ? ' · ' + c.name : ''); }
    else if (it.type === 'hull') { const hd = D.HULLS[def.hullId]; meta = '舰体图纸 · ' + hd.name + '<br>装甲 <b>' + Math.round(hd.armor) + '</b> · OP <b>' + hd.op + '</b>'; }
    return head + '<div style="margin:6px 0;line-height:1.55">' + meta + (def.desc ? '<div class="hint" style="margin-top:5px">' + def.desc + '</div>' : '') + '</div>';
  }

  /* ============================================================
     仓库页面：货舱 / 舰体 / 强化 / 遗物 / 僚舰 / 消耗品
     ============================================================ */
  const HoldApp = {
    selStash: null,

    run() { return RunApp.run; },
    toast(msg) { RunApp.toast(msg); },
    save() { RunApp.save(); },
    afterOp(res) {
      if (res && res.msg) this.toast(res.msg);
      this.selStash = null;
      this.save();
      this.render();
      RunApp.renderMap();
    },

    render() {
      const root = document.getElementById('hold-root');
      root.innerHTML =
        '<div class="hold-left panel">' +
        '  <div class="panel-title">舰体 <span class="hint">图纸可在船舱改装</span></div><div id="hold-hull"></div>' +
        '  <div class="panel-title" style="border-top:1px solid var(--line);margin-top:6px">永久强化</div><div id="hold-upgrades"></div>' +
        '  <div class="panel-title" style="border-top:1px solid var(--line);margin-top:6px">遗物 <span id="hold-relic-count" class="hint"></span></div><div id="hold-relics"></div>' +
        '  <div class="panel-title" style="border-top:1px solid var(--line);margin-top:6px">僚舰编队 <span id="hold-escort-count" class="hint"></span></div><div id="hold-escorts"></div>' +
        '  <div class="panel-title" style="border-top:1px solid var(--line);margin-top:6px">战斗消耗品 <span class="hint">战斗按 6/7/8 使用</span></div><div id="hold-cons"></div>' +
        '  <div class="hold-hint" id="hold-hint"></div>' +
        '</div>' +
        '<div class="hold-mid panel">' +
        '  <div class="panel-title">船舱 <span id="stash-count" class="hint"></span>' +
        '    <button id="btn-hold-refit" class="btn btn-tiny btn-primary" style="margin-left:auto">🔧 改装</button>' +
        '    <button id="btn-hold-back" class="btn btn-tiny" style="margin-left:6px">← 返回航线</button></div>' +
        '  <div id="stash-grid"></div>' +
        '  <div id="hold-op-line" class="hint" style="text-align:left"></div>' +
        '</div>' +
        '<div class="hold-right panel">' +
        '  <div class="panel-title">旗舰' +
        '    <button id="btn-hold-ship-refit" class="btn btn-tiny btn-primary" style="margin-left:auto">🔧 改装</button></div>' +
        '  <div id="hold-ship-view" style="text-align:center;padding:6px"></div>' +
        '  <div id="hold-ship-stats" class="hold-hint"></div>' +
        '  <div id="hold-detail" style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px"></div>' +
        '</div>';
      document.getElementById('btn-hold-refit').onclick = () => RunApp.openRefit();
      document.getElementById('btn-hold-back').onclick = () => { this.selStash = null; RunApp.restoreFromHold(); };
      const srb = document.getElementById('btn-hold-ship-refit'); if (srb) srb.onclick = () => RunApp.openRefit();
      this.renderShipView();
      this.renderHull();
      this.renderUpgrades();
      this.renderRelics();
      this.renderEscorts();
      this.renderCons();
      this.renderStash();
      this.renderStats();
    },

    renderStats() {
      const run = this.run();
      const st = RunCore.stats(run);
      const op = RunCore.opUsed(run), opMax = RunCore.opMax(run);
      const opText = Math.abs(op - Math.round(op)) < 0.005 ? String(Math.round(op)) : op.toFixed(1);
      const opEl = document.getElementById('hold-op-line');
      opEl.textContent = '旗舰 OP ' + opText + ' / ' + opMax + (op > opMax + 0.005 ? ' · 超限！' : '');
      opEl.style.color = op > opMax + 0.005 ? 'var(--red)' : 'var(--gold)';
      document.getElementById('hold-hint').innerHTML =
        '耐久 <b style="color:#9fe8b8">' + Math.round(st.hull) + '</b> · 装甲 <b style="color:#c8d8e8">' + Math.round(st.armor) + '</b> · 航速 <b style="color:#5ad1ff">' + D.knots(st.maxSpeed) + '</b> 节<br>' +
        '散热 <b style="color:#ffab45">' + Math.round(st.heatDiss) + '</b>/s · 热容 <b style="color:#ffab45">' + Math.round(st.heatCap) + '</b>' +
        ' · 护盾系数 <b style="color:#5ae0c8">×' + st.shieldCoef.toFixed(2) + '</b>';
    },

    /* ---------- 旗舰视觉(右栏) ---------- */
    renderShipView() {
      const run = this.run();
      const hull = D.HULLS[run.flagship.hullId];
      const el = document.getElementById('hold-ship-view');
      if (el) {
        el.innerHTML = '<canvas id="hold-ship-canvas" width="300" height="240" style="max-width:100%;height:auto;image-rendering:pixelated"></canvas>';
        const cv = document.getElementById('hold-ship-canvas');
        if (cv) Renderer.drawShipMini(cv, hull, run.flagship);
      }
      const st = RunCore.stats(run);
      const stel = document.getElementById('hold-ship-stats');
      if (stel) stel.innerHTML = '<b>' + hull.name + '</b> · ' + hull.cls + '<br>耐久 <b style="color:#9fe8b8">' + Math.round(st.hull) + '</b> · 装甲 <b style="color:#c8d8e8">' + Math.round(st.armor) + '</b> · OP ' + Math.round(RunCore.opUsed(run)) + '/' + RunCore.opMax(run);
    },

    /* ---------- 右侧栏 ---------- */
    renderHull() {
      const run = this.run();
      const hull = D.HULLS[run.flagship.hullId];
      const st = RunCore.stats(run);
      document.getElementById('hold-hull').innerHTML =
        '<div class="hull-name">' + hull.ico + ' ' + hull.name + '</div>' +
        '<div class="hull-sub">基础 OP ' + hull.op + '（+强化 ' + st.op + '） · 装甲 ' + Math.round(st.armor) + '</div>' +
        '<div class="hint">船舱中的舰体图纸可在此改装</div>';
    },

    renderUpgrades() {
      const el = document.getElementById('hold-upgrades');
      const u = this.run().flagship.upgrades;
      const parts = [];
      for (const id in u) {
        const up = D.UPGRADES[id];
        if (up && u[id] > 0) parts.push('<span class="up-chip">' + up.name + (u[id] > 1 ? ' ×' + u[id] : '') + '</span>');
      }
      el.innerHTML = parts.length ? parts.join('') : '<div class="empty-hint">暂无永久强化（船舱中的⬆芯片可生效）</div>';
    },

    renderRelics() {
      const el = document.getElementById('hold-relics');
      const run = this.run();
      const slots = RunCore.relicSlots(run);
      document.getElementById('hold-relic-count').textContent = run.flagship.relics.length + '/' + slots;
      let html = '';
      for (let i = 0; i < slots; i++) {
        const rid = run.flagship.relics[i];
        if (rid) {
          const r = D.RELICS[rid];
          html += '<div class="eq-item" data-ridx="' + i + '" style="cursor:pointer">🏺 <b>' + r.name + '</b> <span class="hint">点击取下</span></div>';
        } else {
          html += '<div class="eq-item dim">▢ 空遗物槽 <span class="hint">（第 3、5 天解锁更多）</span></div>';
        }
      }
      el.innerHTML = html;
      el.querySelectorAll('[data-ridx]').forEach(row => {
        row.onclick = () => this.afterOp(RunCore.deactivateRelic(run, parseInt(row.dataset.ridx, 10)));
      });
    },

    renderEscorts() {
      const el = document.getElementById('hold-escorts');
      const run = this.run();
      const slots = RunCore.escortSlots(run);
      document.getElementById('hold-escort-count').textContent = run.escorts.length + '/' + slots;
      let html = '';
      for (let i = 0; i < slots; i++) {
        const e = run.escorts[i];
        if (e) {
          const c = D.ESCORT_CARDS[e.cardId];
          html += '<div class="eq-item" data-eidx="' + i + '" style="cursor:pointer">🚢 <b>' + (c ? c.name : '?') + '</b> <span class="hint">点击撤下 · 改装/性格见「改装」</span></div>';
        } else {
          html += '<div class="eq-item dim">▢ 空僚舰位 <span class="hint">（第 3 天解锁第二个）</span></div>';
        }
      }
      el.innerHTML = html;
      el.querySelectorAll('[data-eidx]').forEach(row => {
        row.onclick = () => this.afterOp(RunCore.unequipEscort(run, parseInt(row.dataset.eidx, 10)));
      });
    },

    renderCons() {
      const el = document.getElementById('hold-cons');
      const run = this.run();
      let html = '';
      for (let i = 0; i < 3; i++) {
        const id = run.consSlots[i];
        if (id) {
          const c = D.CONSUMABLES[id];
          html += '<div class="eq-item" data-cidx="' + i + '" style="cursor:pointer">🧰 <b>' + c.name + '</b> <span class="hint">槽 ' + (i + 1) + ' · 点击取出</span></div>';
        } else {
          html += '<div class="eq-item dim">▢ 消耗槽 ' + (i + 1) + '（从船舱装填）</div>';
        }
      }
      el.innerHTML = html;
      el.querySelectorAll('[data-cidx]').forEach(row => {
        row.onclick = () => this.afterOp(RunCore.unassignConsumable(run, parseInt(row.dataset.cidx, 10)));
      });
    },

    /* ---------- 船舱 ---------- */
    itemHtml(it, idx) {
      return '<div class="stash-cell" data-idx="' + idx + '" style="border-color:' + D.RARITY_COLOR[it.rarity] + '">' +
        '<div class="stash-ico">' + D.ITEM_ICON[it.type] + '</div>' +
        '<div class="stash-name">' + it.def.name + '</div>' +
        '<div class="stash-rarity" style="color:' + D.RARITY_COLOR[it.rarity] + '">' + D.RARITY_LABEL[it.rarity] + '</div>' +
        (it.type === 'consumable' ? '<div class="stash-slot" data-slot="' + this.conSlotOf(it.id) + '"></div>' : '') +
        '</div>';
    },
    conSlotOf(consId) {
      const s = this.run().consSlots.indexOf(consId);
      return s >= 0 ? '消耗槽' + (s + 1) : '';
    },

    renderStash() {
      const run = this.run();
      const cap = RunCore.stashCap(run);
      const grid = document.getElementById('stash-grid');
      document.getElementById('stash-count').textContent = run.stash.length + ' / ' + cap + '（随天数提升）';
      let html = '';
      for (let i = 0; i < cap; i++) {
        const it = run.stash[i];
        html += it ? this.itemHtml(it, i) : '<div class="stash-cell empty"><span style="color:var(--text-dim)">空</span></div>';
      }
      grid.innerHTML = html;
      grid.querySelectorAll('.stash-cell[data-idx]').forEach(cell => {
        cell.addEventListener('click', () => {
          this.selStash = parseInt(cell.dataset.idx, 10);
          this.renderStash();
          this.renderStashDetail();
        });
      });
      if (this.selStash !== null) {
        const c = grid.querySelector('.stash-cell[data-idx="' + this.selStash + '"]');
        if (c) c.classList.add('selected');
      }
      this.renderStashDetail();
    },

    renderStashDetail() {
      const el = document.getElementById('hold-detail');
      if (this.selStash === null) {
        el.innerHTML = '<div class="empty-hint">点击物品查看详情/操作</div>';
        return;
      }
      const run = this.run();
      const it = run.stash[this.selStash];
      if (!it) { el.innerHTML = ''; return; }
      const sell = Math.max(1, Math.round(it.value * 0.5));
      let btns = '';
      if (it.type === 'weapon') btns += '<button class="btn btn-tiny btn-primary" data-act="equip">装备到旗舰槽位</button>';
      if (it.type === 'hullmod') btns += '<button class="btn btn-tiny btn-primary" data-act="hullmod">' +
        (run.flagship.hullmods.indexOf(it.id) >= 0 ? '从旗舰卸下（需船舱空间）' : '安装到旗舰') + '</button>';
      if (it.type === 'relic') btns += '<button class="btn btn-tiny btn-primary" data-act="relic">启用遗物</button>';
      if (it.type === 'upgrade') btns += '<button class="btn btn-tiny btn-primary" data-act="upgrade">使用（永久生效）</button>';
      if (it.type === 'consumable') btns +=
        '<button class="btn btn-tiny btn-primary" data-act="cons" data-slot="0">装入消耗槽 1</button>' +
        '<button class="btn btn-tiny btn-primary" data-act="cons" data-slot="1">装入消耗槽 2</button>' +
        '<button class="btn btn-tiny btn-primary" data-act="cons" data-slot="2">装入消耗槽 3</button>';
      if (it.type === 'escort') btns += '<button class="btn btn-tiny btn-primary" data-act="escort">编入僚舰</button>';
      if (it.type === 'hull') btns += '<button class="btn btn-tiny btn-primary" data-act="hull">改装旗舰</button>';
      btns += '<button class="btn btn-tiny" data-act="sell">出售 +' + sell + ' 金币</button>' +
        '<button class="btn btn-tiny btn-danger" data-act="drop">丢弃</button>';
      el.innerHTML =
        '<div class="stash-detail-box">' +
        itemDetailHtml(it) +
        '<div class="weapon-btns">' + btns + '</div>' +
        '<div id="stash-sub"></div></div>';
      const bind = (act, fn) => {
        const b = el.querySelector('[data-act="' + act + '"]');
        if (b) b.onclick = fn;
      };
      bind('sell', () => {
        const res = RunCore.sellItem(run, this.selStash);
        this.selStash = null;
        this.afterOp(res);
      });
      bind('drop', () => {
        const dropped = RunCore.removeFromStash(run, this.selStash);
        this.selStash = null;
        this.afterOp({ ok: true, msg: '丢弃 ' + (dropped ? dropped.def.name : '物品') });
      });
      bind('upgrade', () => this.afterOp(RunCore.useUpgrade(run, this.selStash)));
      bind('relic', () => this.afterOp(RunCore.activateRelic(run, this.selStash)));
      bind('hullmod', () => this.afterOp(RunCore.toggleHullmod(run, it.id)));
      bind('hull', () => this.afterOp(RunCore.switchHull(run, this.selStash)));
      bind('escort', () => {
        const res = RunCore.equipEscort(run, this.selStash);
        if (res.replace) {
          const stashIdx = this.selStash;
          RunApp.escortModal(run.stash[stashIdx].id, (idx) => {
            if (idx >= 0) this.afterOp(RunCore.replaceEscort(run, idx, stashIdx));
            else this.render();
          });
        } else {
          this.afterOp(res);
        }
      });
      if (it.type === 'consumable') {
        el.querySelectorAll('[data-act="cons"]').forEach(b => {
          b.onclick = () => {
            const slotIdx = parseInt(b.dataset.slot, 10);
            this.afterOp(RunCore.assignConsumable(run, slotIdx, this.selStash));
          };
        });
      }
      if (it.type === 'weapon') {
        bind('equip', () => this.renderSlotPicker(it));
      }
    },

    /** 选择装备槽位（旗舰） */
    renderSlotPicker(item) {
      const run = this.run();
      const hull = D.HULLS[run.flagship.hullId];
      const sub = document.getElementById('stash-sub');
      const w = item.def;
      const compat = hull.slots.filter(s => SIZE_RANK[w.size] <= SIZE_RANK[s.size] && w.mount === s.type);
      if (!compat.length) {
        sub.innerHTML = '<div class="empty-hint">没有兼容的槽位</div>';
        return;
      }
      let html = '<div class="empty-hint">选择装备槽位：</div>';
      for (const slot of compat) {
        const cur = run.flagship.weapons[slot.id];
        const label = cur ? '（替换 ' + D.WEAPONS[cur].name + '）' : '（空）';
        html += '<button class="btn btn-tiny" data-slotid="' + slot.id + '" style="margin:2px">' + slot.id + ' ' + label + '</button>';
      }
      sub.innerHTML = html;
      sub.querySelectorAll('[data-slotid]').forEach(b => {
        b.onclick = () => {
          const res = RunCore.equipWeapon(run, b.dataset.slotid, this.selStash);
          this.afterOp(res);
        };
      });
    }
  };

  /* ============================================================
     改装页面：旗舰装配 + 僚舰改装（含性格）
     ============================================================ */
  const RefitApp = {
    target: 0, // 0 = 旗舰；1..N = 僚舰
    selSlot: null,
    hoverSlot: null,
    tab: 'weapons',
    view: { zoom: 1, ox: 0, oy: 0 },
    drag: { on: false, moved: false, lx: 0, ly: 0 },
    _mouseBound: false,
    _viewHullId: null,

    run() { return RunApp.run; },
    toast(msg) { RunApp.toast(msg); },
    save() { RunApp.save(); },
    isEscort() { return this.target > 0; },
    escIdx() { return this.target - 1; },
    loadout() { return this.isEscort() ? this.run().escorts[this.escIdx()].loadout : this.run().flagship; },
    hullId() { return this.loadout().hullId; },
    opMax() { return this.isEscort() ? RunCore.escortOpMax(this.run(), this.escIdx()) : RunCore.opMax(this.run()); },
    opUsed() { return D.loadoutOP(this.loadout()); },
    currentStats() {
      if (this.isEscort()) {
        const lo = this.loadout();
        return D.finalStats(lo.hullId, lo.hullmods, lo.opTuning);
      }
      return RunCore.stats(this.run());
    },
    afterOp(res) {
      if (res && res.msg) this.toast(res.msg);
      this.save();
      this.render();
      RunApp.renderMap();
    },

    render() {
      const root = document.getElementById('refit-root');
      const run = this.run();
      let targetBtns = '<button class="btn btn-tiny' + (this.target === 0 ? ' btn-primary' : '') + '" data-t="0">旗舰</button>';
      run.escorts.forEach((e, i) => {
        const c = D.ESCORT_CARDS[e.cardId];
        targetBtns += '<button class="btn btn-tiny' + (this.target === i + 1 ? ' btn-primary' : '') + '" data-t="' + (i + 1) + '">' + (c ? c.name : '僚舰') + '</button>';
      });
      root.innerHTML =
        '<div class="hold-topbar panel" style="display:flex;align-items:center;gap:8px;padding:8px 12px">' +
        '  <span class="hint">改装目标：</span>' + targetBtns +
        '  <span id="refit-op-line" class="hint" style="margin-left:auto"></span>' +
        '  <button id="btn-refit-hold" class="btn btn-tiny">← 仓库</button>' +
        '  <button id="btn-refit-back" class="btn btn-tiny">返回航线</button>' +
        '</div>' +
        '<div class="refit-stack">' +
        '  <div class="refit-ship-col">' +
        '    <div class="panel refit-ship-row">' +
        '      <div style="position:relative;flex:1;display:flex;min-height:0">' +
        '        <canvas id="refit-canvas" width="720" height="600"></canvas>' +
        '        <div id="refit-zoom-badge" class="zoom-badge">×1.0</div>' +
        '      </div>' +
        '      <div class="hold-hint" id="refit-hint"></div>' +
        (this.isEscort() ? '<div class="panel-title" style="border-top:1px solid var(--line);margin-top:6px">舰长性格</div><div id="refit-persona" style="display:flex;gap:6px;flex-wrap:wrap;padding:8px"></div>' : '') +
        '    </div>' +
        '  </div>' +
        '  <div class="panel refit-tabs-col">' +
        '    <div class="tabs">' +
        '      <button data-tab="weapons" class="tab-btn active">武器</button>' +
        '      <button data-tab="mods" class="tab-btn">插件</button>' +
        '      <button data-tab="tune" class="tab-btn">调校</button>' +
        '      <button data-tab="groups" class="tab-btn">分组</button>' +
        '    </div>' +
        '    <div id="tab-weapons" class="tab"></div>' +
        '    <div id="tab-mods" class="tab hidden"></div>' +
        '    <div id="tab-tune" class="tab hidden"></div>' +
        '    <div id="tab-groups" class="tab hidden"></div>' +
        '  </div>' +
        '</div>';

      root.querySelectorAll('[data-t]').forEach(b => {
        b.onclick = () => {
          this.target = parseInt(b.dataset.t, 10);
          this.selSlot = null;
          this.view = { zoom: 1, ox: 0, oy: 0 };
          this.render();
        };
      });
      document.getElementById('btn-refit-hold').onclick = () => RunApp.openHold();
      document.getElementById('btn-refit-back').onclick = () => { this.selSlot = null; RunApp.restoreFromHold(); };
      root.querySelectorAll('.tab-btn').forEach(b => {
        b.onclick = () => {
          this.tab = b.dataset.tab;
          root.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x === b));
          root.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
          document.getElementById('tab-' + this.tab).classList.remove('hidden');
          this.renderTabs();
        };
      });

      this.bindCanvas();
      this.renderBlueprint();
      this.renderHint();
      this.renderOpLine();
      this.renderTabs();
      if (this.isEscort()) this.renderPersona();
    },

    bindCanvas() {
      const canvas = document.getElementById('refit-canvas');
      canvas.onmousedown = (e) => this.onMouseDown(e);
      canvas.onwheel = (e) => this.onWheel(e);
      canvas.onmouseleave = () => { if (this.hoverSlot) { this.hoverSlot = null; this.renderBlueprint(); } };
      canvas.oncontextmenu = (e) => e.preventDefault();
      if (!this._mouseBound) {
        this._mouseBound = true;
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
      }
    },

    /* ---------- 蓝图（缩放 / 平移 / 悬停；画布自适应填满面板） ---------- */
    canvasSize() {
      const canvas = document.getElementById('refit-canvas');
      const rect = canvas.getBoundingClientRect();
      return { w: Math.max(320, rect.width), h: Math.max(320, rect.height) };
    },
    renderBlueprint() {
      const hullId = this.hullId();
      if (this._viewHullId !== hullId) { this._viewHullId = hullId; this.view = { zoom: 1, ox: 0, oy: 0 }; }
      const canvas = document.getElementById('refit-canvas');
      const ctx = canvas.getContext('2d');
      const { w, h } = this.canvasSize();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Renderer.drawHullBlueprint(ctx, D.HULLS[hullId], this.loadout(), this.selSlot, w, h, Date.now() / 1000, this.hoverSlot, this.view);
      const badge = document.getElementById('refit-zoom-badge');
      if (badge) badge.textContent = '×' + this.view.zoom.toFixed(1);
    },
    canvasPoint(e) {
      const canvas = document.getElementById('refit-canvas');
      const rect = canvas.getBoundingClientRect();
      const { w, h } = this.canvasSize();
      return {
        x: (e.clientX - rect.left) * (w / rect.width),
        y: (e.clientY - rect.top) * (h / rect.height)
      };
    },
    onMouseDown(e) {
      if (e.button !== 0) return;
      const p = this.canvasPoint(e);
      this.drag = { on: true, moved: false, lx: p.x, ly: p.y };
    },
    onMouseMove(e) {
      const vr = document.getElementById('view-refit');
      if (!vr || vr.classList.contains('hidden')) return;
      const p = this.canvasPoint(e);
      if (this.drag.on) {
        const dx = p.x - this.drag.lx, dy = p.y - this.drag.ly;
        if (!this.drag.moved && Math.hypot(dx, dy) > 5) this.drag.moved = true;
        if (this.drag.moved) {
          const maxOff = 600;
          this.view.ox = U.clamp(this.view.ox + dx, -maxOff, maxOff);
          this.view.oy = U.clamp(this.view.oy + dy, -maxOff, maxOff);
          this.drag.lx = p.x;
          this.drag.ly = p.y;
          this.renderBlueprint();
        }
        return;
      }
      const canvas = document.getElementById('refit-canvas');
      const { w: cw, h: ch } = this.canvasSize();
      const slotId = Renderer.slotHit(D.HULLS[this.hullId()], cw, ch, p.x, p.y, this.view);
      if (slotId !== this.hoverSlot) { this.hoverSlot = slotId; this.renderBlueprint(); }
    },
    onMouseUp(e) {
      if (e.button !== 0 || !this.drag.on) return;
      const wasDrag = this.drag.moved;
      this.drag = { on: false, moved: false, lx: 0, ly: 0 };
      if (!wasDrag) {
        const p = this.canvasPoint(e);
        const canvas = document.getElementById('refit-canvas');
        const { w: cw, h: ch } = this.canvasSize();
        const slotId = Renderer.slotHit(D.HULLS[this.hullId()], cw, ch, p.x, p.y, this.view);
        this.selSlot = slotId;
        this.renderBlueprint();
        this.renderHint();
        this.renderTabs();
      }
    },
    onWheel(e) {
      e.preventDefault();
      const canvas = document.getElementById('refit-canvas');
      const rect = canvas.getBoundingClientRect();
      const { w, h } = this.canvasSize();
      const mx = (e.clientX - rect.left) * (w / rect.width);
      const my = (e.clientY - rect.top) * (h / rect.height);
      const cx = w / 2, cy = h / 2 + 10;
      const old = this.view.zoom;
      const nz = U.clamp(old * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.5, 4);
      const k = nz / old;
      this.view.ox = (mx - cx) - (mx - cx - this.view.ox) * k;
      this.view.oy = (my - cy) - (my - cy - this.view.oy) * k;
      this.view.zoom = nz;
      this.renderBlueprint();
    },

    renderHint() {
      const st = this.currentStats();
      let slotInfo = '';
      if (this.selSlot) {
        const slot = D.HULLS[this.hullId()].slots.find(s => s.id === this.selSlot);
        if (slot) {
          const wid = this.loadout().weapons[slot.id];
          slotInfo = '<br>▶ 选中槽位 <b style="color:#ffd27a">' + slot.id + '</b>（' + SIZE_LABEL[slot.size] + TYPE_LABEL[slot.type] + ' · 射界 ' + slot.arc + '°' +
            (wid ? ' · 已装 ' + D.WEAPONS[wid].name : ' · 空槽') + '）';
        }
      }
      document.getElementById('refit-hint').innerHTML =
        '耐久 <b style="color:#9fe8b8">' + Math.round(st.hull) + '</b> · 装甲 <b style="color:#c8d8e8">' + Math.round(st.armor) + '</b> · 航速 <b style="color:#5ad1ff">' + D.knots(st.maxSpeed) + '</b> 节<br>' +
        '散热 <b style="color:#ffab45">' + Math.round(st.heatDiss) + '</b>/s · 热容 <b style="color:#ffab45">' + Math.round(st.heatCap) + '</b>' +
        ' · 护盾系数 <b style="color:#5ae0c8">×' + st.shieldCoef.toFixed(2) + '</b>' +
        (slotInfo || '<br>点击槽位装配 · 滚轮缩放 / 拖拽平移');
    },

    renderOpLine() {
      const op = this.opUsed(), opMax = this.opMax();
      const opText = Math.abs(op - Math.round(op)) < 0.005 ? String(Math.round(op)) : op.toFixed(1);
      const el = document.getElementById('refit-op-line');
      el.textContent = 'OP ' + opText + ' / ' + opMax + (op > opMax + 0.005 ? ' · 超限！' : '');
      el.style.color = op > opMax + 0.005 ? 'var(--red)' : 'var(--gold)';
    },

    /* ---------- 标签页 ---------- */
    renderTabs() {
      if (this.tab === 'weapons') this.renderWeaponsTab();
      if (this.tab === 'mods') this.renderModsTab();
      if (this.tab === 'tune') this.renderTuneTab();
      if (this.tab === 'groups') this.renderGroupsTab();
    },

    weaponStatsHtml(w) {
      if (w.kind === 'fighter') {
        return '小队 <b>×' + w.squad + '</b> · 耐久 <b>' + w.hp + '</b> · 航速 <b>' + w.speed + '</b> · 伤害 <b>' + w.dmg + '</b> · 弹药 <b>' + w.ammo + '</b> · 补充整备 <b>' + w.prepCost + '</b>';
      }
      const parts = [];
      if (w.kind === 'beam') {
        parts.push('伤害 <b>' + w.dmg + '</b>/秒');
        parts.push('热量 <b>' + w.heatPS + '</b>/秒');
      } else {
        parts.push('伤害 <b>' + w.dmg + (w.burst ? '×' + w.burst : '') + '</b>');
        parts.push('装填 <b>' + w.refire + 's</b>');
        parts.push('热量 <b>' + w.heat + '</b>');
        if (w.ammo) parts.push('备弹 <b>' + w.ammo + '</b>');
      }
      parts.push('射程 <b>' + w.range + '</b>');
      if (w.blast) parts.push('近炸 <b>' + w.blast + '</b>');
      if (w.depth) parts.push('潜深 <b>' + w.depth + '</b>');
      if (w.kind === 'torpedo') parts.push('深水（吃水不足免疫）');
      if (w.kind === 'missile') parts.push('可被拦截');
      return parts.join(' · ');
    },
    wtags(w) {
      if (w.kind === 'fighter') {
        return '<span class="w-tag missile">载机</span>' +
          '<span class="w-tag ' + w.size.toUpperCase() + '">' + SIZE_LABEL[w.size] + '</span>';
      }
      const dt = D.dtypeOf(w);
      return '<span class="w-tag ' + KIND_CLS[w.kind] + '">' + KIND_LABEL[w.kind] + '</span>' +
        '<span class="w-tag dt-' + dt + '" title="伤害类型：' + DTYPE_LABEL[dt] + '（对盾 ' + { he: '0.5×', kin: '2×', frag: '0.25×', beam: '1×' }[dt] + ' / 对甲 ' + { he: '2×', kin: '0.5×', frag: '0.25×', beam: '1×' }[dt] + '）">' + DTYPE_LABEL[dt] + '</span>' +
        '<span class="w-tag ' + w.size.toUpperCase() + '">' + SIZE_LABEL[w.size] + '</span>';
    },

    renderWeaponsTab() {
      const el = document.getElementById('tab-weapons');
      el.innerHTML = '';
      const run = this.run();
      const lo = this.loadout();
      const hull = D.HULLS[this.hullId()];
      const esc = this.isEscort();
      const escIdx = this.escIdx();

      if (this.selSlot) {
        const slot = hull.slots.find(s => s.id === this.selSlot);
        if (slot) {
          const wid = lo.weapons[this.selSlot];
          const box = document.createElement('div');
          box.className = 'slot-info';
          box.innerHTML =
            '<h4>⭘ 槽位 ' + slot.id + '（' + SIZE_LABEL[slot.size] + TYPE_LABEL[slot.type] + ' · 射界 ' + slot.arc + '°）</h4>' +
            '<p>' + (wid ? '已装：<b>' + D.WEAPONS[wid].name + '</b>' : '<span class="empty-hint">空槽 — 从船舱武器装备</span>') + '</p>';
          el.appendChild(box);
          if (wid) {
            const btns = document.createElement('div');
            btns.className = 'w-btns';
            btns.style.margin = '0 0 8px 2px';
            const un = document.createElement('button');
            un.className = 'btn btn-danger btn-tiny';
            un.textContent = '卸下';
            un.onclick = () => this.afterOp(esc ? RunCore.escortUnequipWeapon(run, escIdx, this.selSlot) : RunCore.unequipWeapon(run, this.selSlot));
            btns.appendChild(un);
            for (let g = 1; g <= 5; g++) {
              const cur = [1, 2, 3, 4, 5].find(i => lo.groups[i].weapons.indexOf(this.selSlot) >= 0);
              const b = document.createElement('button');
              b.className = 'btn btn-tiny' + (cur === g ? ' btn-primary' : '');
              b.textContent = '组' + g;
              b.onclick = () => this.afterOp(esc ? RunCore.escortMoveWeaponGroup(run, escIdx, this.selSlot, g) : RunCore.moveWeaponGroup(run, this.selSlot, g));
              btns.appendChild(b);
            }
            el.appendChild(btns);
          }
          const title = document.createElement('div');
          title.className = 'sec-title';
          title.textContent = '船舱适配武器（点击装备）';
          el.appendChild(title);
          const compat = [];
          run.stash.forEach((it, idx) => {
            if (it.type !== 'weapon') return;
            if (SIZE_RANK[it.def.size] <= SIZE_RANK[slot.size] && it.def.mount === slot.type) compat.push({ it, idx });
          });
          if (!compat.length) {
            const p = document.createElement('p');
            p.className = 'empty-hint';
            p.textContent = '船舱中没有适配该槽位的武器';
            el.appendChild(p);
          }
          for (const c of compat) {
            const card = document.createElement('div');
            card.className = 'w-card';
            card.innerHTML =
              '<div class="w-name">' + c.it.def.name + this.wtags(c.it.def) + '</div>' +
              '<div class="w-stats">' + this.weaponStatsHtml(c.it.def) + ' · OP <span class="w-op">' + c.it.def.op + '</span></div>' +
              '<div class="w-btns"><button class="btn btn-tiny btn-primary">装备</button></div>';
            card.querySelector('button').onclick = (ev) => {
              ev.stopPropagation();
              this.afterOp(esc ? RunCore.escortEquipWeapon(run, escIdx, this.selSlot, c.idx) : RunCore.equipWeapon(run, this.selSlot, c.idx));
            };
            card.onclick = () => this.afterOp(esc ? RunCore.escortEquipWeapon(run, escIdx, this.selSlot, c.idx) : RunCore.equipWeapon(run, this.selSlot, c.idx));
            el.appendChild(card);
          }
        }
      }

      const title2 = document.createElement('div');
      title2.className = 'sec-title';
      title2.textContent = '已装备武器（点击定位槽位）';
      el.appendChild(title2);
      const mounted = [];
      for (const slotId in lo.weapons) mounted.push(slotId);
      if (!mounted.length) {
        const p = document.createElement('p');
        p.className = 'empty-hint';
        p.textContent = '尚未装备武器';
        el.appendChild(p);
      }
      for (const slotId of mounted) {
        const w = D.WEAPONS[lo.weapons[slotId]];
        const card = document.createElement('div');
        card.className = 'w-card equipped';
        card.innerHTML =
          '<div class="w-name"><span style="color:var(--gold)">' + slotId + '</span>' + w.name + this.wtags(w) + '</div>' +
          '<div class="w-stats">' + this.weaponStatsHtml(w) + ' · OP <span class="w-op">' + w.op + '</span></div>';
        card.onclick = () => { this.selSlot = slotId; this.render(); };
        el.appendChild(card);
      }
    },

    renderModsTab() {
      const el = document.getElementById('tab-mods');
      el.innerHTML = '';
      const run = this.run();
      const lo = this.loadout();
      const esc = this.isEscort();
      const escIdx = this.escIdx();
      for (const id in D.HULLMODS) {
        const hm = D.HULLMODS[id];
        const equipped = lo.hullmods.indexOf(id) >= 0;
        const owned = run.stash.some(it => it.type === 'hullmod' && it.id === id);
        const card = document.createElement('div');
        card.className = 'mods-card' + (equipped ? ' equipped' : '');
        card.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div class="m-name">' + hm.name + (equipped ? ' <span style="color:var(--green);font-size:10px">✔</span>' : '') + '</div>' +
          '<div class="m-op">' + hm.op + ' OP</div></div>' +
          '<div class="m-desc">' + hm.desc + (!equipped && !owned ? ' <span style="color:var(--red)">（船舱无此插件）</span>' : '') + '</div>';
        card.onclick = () => {
          if (!equipped && !owned) { this.toast('船舱中没有「' + hm.name + '」'); return; }
          this.afterOp(esc ? RunCore.escortToggleHullmod(run, escIdx, id) : RunCore.toggleHullmod(run, id));
        };
        el.appendChild(card);
      }
    },

    renderTuneTab() {
      const el = document.getElementById('tab-tune');
      el.innerHTML = '';
      const lo = this.loadout();
      if (!lo.opTuning) lo.opTuning = {};
      const max = this.opMax();
      for (const key of ['diss', 'cap', 'dc']) {
        const def = D.OP_TUNE[key];
        const n = lo.opTuning[key] || 0;
        const row = document.createElement('div');
        row.className = 'tune-row';
        row.innerHTML =
          '<span class="t-name"><b>' + def.label + '</b> <span>' + def.desc + '</span></span>' +
          '<input type="range" min="0" max="' + def.max + '" step="0.1" value="' + Math.min(def.max, n) + '" style="flex:1;accent-color:#5ad1ff">' +
          '<span class="t-num" style="min-width:96px;text-align:right">' + n.toFixed(1) + ' 级<br><span style="color:var(--gold)">' + (n * def.cost).toFixed(1) + ' OP</span></span>';
        el.appendChild(row);
        row.querySelector('input').addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          const opOthers = D.loadoutOP(lo) - (lo.opTuning[key] || 0) * def.cost;
          if (opOthers + val * def.cost > max + 0.005) {
            e.target.value = lo.opTuning[key] || 0;
            return;
          }
          lo.opTuning[key] = val;
          this.save();
          this.renderOpLine();
          this.renderHint();
          row.querySelector('.t-num').innerHTML = val.toFixed(1) + ' 级<br><span style="color:var(--gold)">' + (val * def.cost).toFixed(1) + ' OP</span>';
        });
      }
      const note = document.createElement('p');
      note.style.cssText = 'font-size:10.5px;color:var(--text-dim);line-height:1.7;margin-top:6px';
      note.textContent = '损管护盾本身没有容量：开启时承受的伤害按系数（默认 ×1.0）折算为热量（0.42×对盾倍率）与淤热（0.28×对盾倍率），且开盾有维持热量（每秒 1%×系数 热容，进热量）；总热量 = 热量 + 淤热。淤热只有关闭护盾且热量散尽后（先散热后散淤）才缓慢消散；关闭护盾则伤害直击船体。主动散热（V）不可中断、强制关盾且无法开火，但热量 6 倍速排空。过载时护盾强制失效，但仍可移动。';
      el.appendChild(note);
    },

    renderGroupsTab() {
      const el = document.getElementById('tab-groups');
      el.innerHTML = '';
      const run = this.run();
      const lo = this.loadout();
      const esc = this.isEscort();
      const escIdx = this.escIdx();
      for (let g = 1; g <= 5; g++) {
        const gr = lo.groups[g];
        const card = document.createElement('div');
        card.className = 'group-card' + (this.selSlot && gr.weapons.indexOf(this.selSlot) >= 0 ? ' selected' : '');
        const chips = gr.weapons.map(slotId => {
          const wdef = D.WEAPONS[lo.weapons[slotId]];
          if (!wdef) return '';
          return '<span class="chip" data-slot="' + slotId + '">' + slotId + ' ' + wdef.name.slice(0, 5) +
            '<span class="chip-x" data-slot="' + slotId + '" title="卸下">✕</span></span>';
        }).join('');
        card.innerHTML =
          '<div class="group-head"><span class="group-num">' + g + '</span>' +
          '<span style="font-size:10px;color:var(--text-dim)">' + gr.weapons.length + ' 件</span>' +
          '<label class="group-auto"><span>自动开火</span>' +
          '<span class="switch"><input type="checkbox" ' + (gr.auto ? 'checked' : '') + ' data-g="' + g + '"><span class="slider"></span></span></label></div>' +
          '<div class="group-chips">' + (chips || '<span style="font-size:10px;color:var(--text-dim)">空组</span>') + '</div>';
        el.appendChild(card);
        card.querySelector('input').addEventListener('change', (e) => {
          gr.auto = e.target.checked;
          this.save();
        });
        card.addEventListener('click', (e) => {
          if (e.target.closest('.chip') || e.target.closest('input') || e.target.closest('.switch')) return;
          if (this.selSlot && lo.weapons[this.selSlot]) {
            this.afterOp(esc ? RunCore.escortMoveWeaponGroup(run, escIdx, this.selSlot, g) : RunCore.moveWeaponGroup(run, this.selSlot, g));
          }
        });
        card.querySelectorAll('.chip').forEach(chip => {
          chip.addEventListener('click', (e) => {
            const sid = chip.getAttribute('data-slot');
            if (e.target.classList.contains('chip-x')) {
              this.afterOp(esc ? RunCore.escortUnequipWeapon(run, escIdx, sid) : RunCore.unequipWeapon(run, sid));
            } else {
              this.selSlot = sid;
              this.render();
            }
          });
        });
      }
    },

    /* ---------- 僚舰性格 ---------- */
    renderPersona() {
      const el = document.getElementById('refit-persona');
      el.innerHTML = '';
      const e = this.run().escorts[this.escIdx()];
      const cur = e.persona || 'steady';
      for (const p of PERSONAS) {
        const b = document.createElement('button');
        b.className = 'btn btn-tiny' + (cur === p.id ? ' btn-primary' : '');
        b.textContent = p.name;
        b.onclick = () => { e.persona = p.id; this.save(); this.render(); };
        el.appendChild(b);
      }
    }
  };

  globalThis.HoldApp = HoldApp;
  globalThis.RefitApp = RefitApp;
})();
