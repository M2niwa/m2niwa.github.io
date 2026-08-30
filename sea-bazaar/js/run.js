/* ============================================================
   远征模式：The Bazaar 式 Roguelike
   每天航线：事件 → 事件 → 小战斗 → 事件 → 事件 → 大战斗
   RunCore = 纯逻辑（可被 Node 测试）；RunApp = DOM 交互层
   ============================================================ */
(function () {
  'use strict';

  const U = Util, D = Data;
  const SIZE_RANK = { small: 0, medium: 1, large: 2 };

  /* ============================================================
     RunCore 纯逻辑
     ============================================================ */
  const RunCore = {
    SEQ: ['event', 'event', 'event', 'small', 'event', 'event', 'event', 'small', 'event', 'event', 'event', 'small', 'big'],
    PHASE_ICON: { event: '🗺', small: '⚔', big: '🔥' },
    PHASE_LABEL: { event: '事件', small: '小战斗', big: '大战斗' },

    newRun() {
      const lo = JSON.parse(JSON.stringify(D.DEFAULT_LOADS.destroyer));
      lo.upgrades = {};
      lo.relics = [];
      return {
        version: 1,
        day: 1,
        phaseIdx: 0,
        gold: 25,
        stash: [],
        stashCapBase: 4,
        flagship: lo,
        escorts: [this.makeEscort('escort_dd_gun')],
        consSlots: [null, null, null],
        endless: false,
        dayMerchantSeen: false,
        log: ['远征开始！旗舰：' + lo.name],
        stat: { battles: 0, kills: 0, goldEarned: 0 }
      };
    },

    /* ---------- 属性 ---------- */
    stats(run) {
      return D.computeStats(run.flagship.hullId, run.flagship.hullmods, run.flagship.upgrades, run.flagship.relics, run.flagship.opTuning);
    },
    stashCap(run) { return Math.min(10, run.stashCapBase + RunCore.stats(run).cargo); },
    relicSlots(run) { return 2 + (run.day >= 3 ? 1 : 0) + (run.day >= 5 ? 1 : 0); },
    escortSlots(run) { return run.day >= 3 ? 2 : 1; },
    /** 从僚舰卡构建一艘可改装、带性格的僚舰对象 */
    makeEscort(cardId) {
      const card = D.ESCORT_CARDS[cardId];
      const preset = D.PRESETS[card.presetId];
      const loadout = D.buildLoadout(preset.hullId, preset.weapons, preset.hullmods, { player: false });
      return { cardId, persona: 'steady', loadout };
    },
    /** 旧存档迁移：字符串卡 id → 僚舰对象 */
    normalizeEscorts(run) {
      if (run.escorts && run.escorts.some(e => typeof e === 'string')) {
        run.escorts = run.escorts.map(e => (typeof e === 'string' ? this.makeEscort(e) : e));
      }
    },
    opMax(run) { return D.HULLS[run.flagship.hullId].op + RunCore.stats(run).op; },
    opUsed(run) { return D.loadoutOP(run.flagship); },
    goldMult(run) { return RunCore.stats(run).goldMult; },

    /* ---------- 阶段推进 ---------- */
    completePhase(run) {
      run.phaseIdx++;
      let dayUp = false, victory = false;
      if (run.phaseIdx >= RunCore.SEQ.length) {
        run.phaseIdx = 0;
        run.day++;
        dayUp = true;
        run.dayMerchantSeen = false;
        run.stashCapBase = Math.min(8, 3 + run.day);
        run.log.push('—— 第 ' + (run.day - 1) + ' 天结束，舰队继续前进 ——');
        if (run.log.length > 12) run.log.shift();
        if (run.day === 6 && !run.endless) victory = true;
      }
      return { dayUp, victory };
    },

    /* ---------- 物品 ---------- */
    addToStash(run, item) {
      if (run.stash.length < RunCore.stashCap(run)) {
        run.stash.push(item);
        return 'ok';
      }
      return 'full';
    },
    forceAdd(run, item, discardIdx) {
      if (discardIdx !== null && discardIdx !== undefined && run.stash[discardIdx]) {
        run.stash.splice(discardIdx, 1);
      }
      run.stash.push(item);
    },
    removeFromStash(run, idx) {
      return run.stash.splice(idx, 1)[0] || null;
    },
    sellItem(run, idx) {
      const item = run.stash[idx];
      if (!item) return { ok: false, msg: '无效物品' };
      const gold = Math.max(1, Math.round(item.value * 0.5));
      run.gold += gold;
      run.stash.splice(idx, 1);
      return { ok: true, msg: '出售 ' + item.def.name + '，+ ' + gold + ' 金币', gold };
    },

    /* ---------- 装备操作（船舱） ---------- */
    equipWeapon(run, slotId, stashIdx) {
      const item = run.stash[stashIdx];
      if (!item || item.type !== 'weapon') return { ok: false, msg: '无效物品' };
      const lo = run.flagship;
      const slot = D.HULLS[lo.hullId].slots.find(s => s.id === slotId);
      if (!slot) return { ok: false, msg: '无效槽位' };
      const w = item.def;
      if (SIZE_RANK[w.size] > SIZE_RANK[slot.size] || w.mount !== slot.type) {
        return { ok: false, msg: w.name + ' 与槽位类型不符' };
      }
      const old = lo.weapons[slotId];
      const opDelta = w.op - (old ? D.WEAPONS[old].op : 0);
      if (RunCore.opUsed(run) + opDelta > RunCore.opMax(run)) {
        return { ok: false, msg: 'OP 超限，无法装备' };
      }
      lo.weapons[slotId] = item.id;
      run.stash.splice(stashIdx, 1);
      if (old) run.stash.push(D.makeItem('weapon', old));
      const inGroup = [1, 2, 3, 4, 5].some(g => lo.groups[g].weapons.indexOf(slotId) >= 0);
      if (!inGroup) {
        const g = w.mount === 'missile' ? 3 : (w.size === 'small' ? 2 : 1);
        lo.groups[g].weapons.push(slotId);
      }
      return { ok: true, msg: w.name + ' 已装备到 ' + slotId };
    },

    unequipWeapon(run, slotId) {
      const lo = run.flagship;
      const wid = lo.weapons[slotId];
      if (!wid) return { ok: false, msg: '该槽位为空' };
      if (run.stash.length >= RunCore.stashCap(run)) return { ok: false, msg: '船舱已满，无法卸下' };
      delete lo.weapons[slotId];
      for (let g = 1; g <= 5; g++) {
        const arr = lo.groups[g].weapons;
        const i = arr.indexOf(slotId);
        if (i >= 0) arr.splice(i, 1);
      }
      run.stash.push(D.makeItem('weapon', wid));
      return { ok: true, msg: '已卸下 ' + D.WEAPONS[wid].name };
    },

    moveWeaponGroup(run, slotId, g) {
      const lo = run.flagship;
      for (let i = 1; i <= 5; i++) {
        const arr = lo.groups[i].weapons;
        const idx = arr.indexOf(slotId);
        if (idx >= 0) arr.splice(idx, 1);
      }
      lo.groups[g].weapons.push(slotId);
      return { ok: true, msg: '已编入第 ' + g + ' 组' };
    },

    toggleHullmod(run, modId) {
      const lo = run.flagship;
      const i = lo.hullmods.indexOf(modId);
      const hm = D.HULLMODS[modId];
      if (!hm) return { ok: false, msg: '无效插件' };
      if (i >= 0) {
        if (run.stash.length >= RunCore.stashCap(run)) return { ok: false, msg: '船舱已满，无法卸下' };
        lo.hullmods.splice(i, 1);
        run.stash.push(D.makeItem('hullmod', modId));
        return { ok: true, msg: '已卸下 ' + hm.name };
      }
      if (RunCore.opUsed(run) + hm.op > RunCore.opMax(run)) return { ok: false, msg: 'OP 超限，无法安装' };
      lo.hullmods.push(modId);
      const idx = run.stash.findIndex(it => it.type === 'hullmod' && it.id === modId);
      if (idx >= 0) run.stash.splice(idx, 1);
      return { ok: true, msg: '已安装 ' + hm.name };
    },

    useUpgrade(run, stashIdx) {
      const item = run.stash[stashIdx];
      if (!item || item.type !== 'upgrade') return { ok: false, msg: '无效物品' };
      const u = run.flagship.upgrades;
      u[item.id] = (u[item.id] || 0) + 1;
      run.stash.splice(stashIdx, 1);
      return { ok: true, msg: item.def.name + ' 已生效' };
    },

    /* ---------- 僚舰改装（与旗舰相同的船舱经济，作用于指定僚舰装配） ---------- */
    escortOpMax(run, escIdx) {
      const e = run.escorts[escIdx];
      return e ? D.HULLS[e.loadout.hullId].op : 0;
    },
    escortEquipWeapon(run, escIdx, slotId, stashIdx) {
      const e = run.escorts[escIdx];
      const item = run.stash[stashIdx];
      if (!e || !item || item.type !== 'weapon') return { ok: false, msg: '无效操作' };
      const lo = e.loadout;
      const slot = D.HULLS[lo.hullId].slots.find(s => s.id === slotId);
      if (!slot) return { ok: false, msg: '无效槽位' };
      const w = item.def;
      if (SIZE_RANK[w.size] > SIZE_RANK[slot.size] || w.mount !== slot.type) return { ok: false, msg: w.name + ' 与槽位类型不符' };
      const old = lo.weapons[slotId];
      const opDelta = w.op - (old ? D.WEAPONS[old].op : 0);
      if (D.loadoutOP(lo) + opDelta > this.escortOpMax(run, escIdx)) return { ok: false, msg: 'OP 超限，无法装备' };
      lo.weapons[slotId] = item.id;
      run.stash.splice(stashIdx, 1);
      if (old) run.stash.push(D.makeItem('weapon', old));
      const inGroup = [1, 2, 3, 4, 5].some(g => lo.groups[g].weapons.indexOf(slotId) >= 0);
      if (!inGroup) {
        const g = w.mount === 'missile' ? 3 : (w.size === 'small' ? 2 : 1);
        lo.groups[g].weapons.push(slotId);
      }
      return { ok: true, msg: w.name + ' 已装备到僚舰 ' + slotId };
    },
    escortUnequipWeapon(run, escIdx, slotId) {
      const e = run.escorts[escIdx];
      if (!e) return { ok: false, msg: '无效僚舰' };
      const lo = e.loadout;
      const wid = lo.weapons[slotId];
      if (!wid) return { ok: false, msg: '该槽位为空' };
      if (run.stash.length >= RunCore.stashCap(run)) return { ok: false, msg: '船舱已满，无法卸下' };
      delete lo.weapons[slotId];
      for (let g = 1; g <= 5; g++) {
        const arr = lo.groups[g].weapons;
        const i = arr.indexOf(slotId);
        if (i >= 0) arr.splice(i, 1);
      }
      run.stash.push(D.makeItem('weapon', wid));
      return { ok: true, msg: '已卸下 ' + D.WEAPONS[wid].name };
    },
    escortToggleHullmod(run, escIdx, modId) {
      const e = run.escorts[escIdx];
      if (!e) return { ok: false, msg: '无效僚舰' };
      const lo = e.loadout;
      const i = lo.hullmods.indexOf(modId);
      const hm = D.HULLMODS[modId];
      if (!hm) return { ok: false, msg: '无效插件' };
      if (i >= 0) {
        if (run.stash.length >= RunCore.stashCap(run)) return { ok: false, msg: '船舱已满，无法卸下' };
        lo.hullmods.splice(i, 1);
        run.stash.push(D.makeItem('hullmod', modId));
        return { ok: true, msg: '已卸下 ' + hm.name };
      }
      if (D.loadoutOP(lo) + hm.op > this.escortOpMax(run, escIdx)) return { ok: false, msg: 'OP 超限，无法安装' };
      lo.hullmods.push(modId);
      const idx = run.stash.findIndex(it => it.type === 'hullmod' && it.id === modId);
      if (idx >= 0) run.stash.splice(idx, 1);
      return { ok: true, msg: '已安装 ' + hm.name };
    },
    escortMoveWeaponGroup(run, escIdx, slotId, g) {
      const e = run.escorts[escIdx];
      if (!e) return { ok: false, msg: '无效僚舰' };
      const lo = e.loadout;
      for (let i = 1; i <= 5; i++) {
        const arr = lo.groups[i].weapons;
        const idx = arr.indexOf(slotId);
        if (idx >= 0) arr.splice(idx, 1);
      }
      lo.groups[g].weapons.push(slotId);
      return { ok: true, msg: '已编入第 ' + g + ' 组' };
    },

    activateRelic(run, stashIdx) {
      const item = run.stash[stashIdx];
      if (!item || item.type !== 'relic') return { ok: false, msg: '无效物品' };
      if (run.flagship.relics.length >= RunCore.relicSlots(run)) {
        return { ok: false, msg: '遗物槽已满（第 3、5 天会解锁更多）' };
      }
      run.flagship.relics.push(item.id);
      run.stash.splice(stashIdx, 1);
      return { ok: true, msg: '遗物「' + item.def.name + '」已启用' };
    },

    deactivateRelic(run, relicIdx) {
      const lo = run.flagship;
      if (!lo.relics[relicIdx]) return { ok: false, msg: '无效遗物' };
      if (run.stash.length >= RunCore.stashCap(run)) return { ok: false, msg: '船舱已满，无法取下' };
      const id = lo.relics.splice(relicIdx, 1)[0];
      run.stash.push(D.makeItem('relic', id));
      return { ok: true, msg: '已取下遗物' };
    },

    equipEscort(run, stashIdx) {
      const item = run.stash[stashIdx];
      if (!item || item.type !== 'escort') return { ok: false, msg: '无效物品' };
      if (run.escorts.length < RunCore.escortSlots(run)) {
        run.escorts.push(this.makeEscort(item.id));
        run.stash.splice(stashIdx, 1);
        return { ok: true, msg: item.def.name + ' 已加入编队' };
      }
      return { ok: false, replace: true, msg: '僚舰位已满，需替换现有僚舰' };
    },

    replaceEscort(run, escIdx, stashIdx) {
      const item = run.stash[stashIdx];
      if (!item || item.type !== 'escort' || !run.escorts[escIdx]) return { ok: false, msg: '无效操作' };
      const old = run.escorts[escIdx];
      run.escorts[escIdx] = this.makeEscort(item.id);
      run.stash.splice(stashIdx, 1);
      run.stash.push(D.makeItem('escort', old.cardId));
      return { ok: true, msg: '僚舰已替换为 ' + item.def.name };
    },

    unequipEscort(run, escIdx) {
      if (!run.escorts[escIdx]) return { ok: false, msg: '无效僚舰' };
      if (run.stash.length >= RunCore.stashCap(run)) return { ok: false, msg: '船舱已满，无法撤下' };
      const old = run.escorts.splice(escIdx, 1)[0];
      run.stash.push(D.makeItem('escort', old.cardId));
      return { ok: true, msg: '僚舰已撤下' };
    },

    switchHull(run, stashIdx) {
      const item = run.stash[stashIdx];
      if (!item || item.type !== 'hull') return { ok: false, msg: '无效图纸' };
      const lo = run.flagship;
      const card = item.def;
      const newHull = D.HULLS[card.hullId];
      if (newHull.id === lo.hullId) return { ok: false, msg: '已经是该舰体了' };
      // 迁移武器：优先装进兼容空槽
      const carry = [];
      const leftover = [];
      const used = {};
      for (const slotId in lo.weapons) {
        const wdef = D.WEAPONS[lo.weapons[slotId]];
        let target = null;
        for (const slot of newHull.slots) {
          if (used[slot.id]) continue;
          if (SIZE_RANK[wdef.size] <= SIZE_RANK[slot.size] && wdef.mount === slot.type) {
            target = slot;
            break;
          }
        }
        if (target) {
          used[target.id] = true;
          carry.push([target.id, lo.weapons[slotId]]);
        } else {
          leftover.push(lo.weapons[slotId]);
        }
      }
      if (run.stash.length - 1 + leftover.length > RunCore.stashCap(run)) {
        return { ok: false, msg: '船舱空间不足（需 ' + leftover.length + ' 个空位存放不兼容武器）' };
      }
      const autoFlags = {};
      for (let g = 1; g <= 5; g++) autoFlags[g] = lo.groups[g].auto;
      const weapons = {};
      carry.forEach(([sid, wid]) => { weapons[sid] = wid; });
      lo.hullId = card.hullId;
      lo.weapons = weapons;
      const groups = {};
      for (let g = 1; g <= 5; g++) groups[g] = { auto: !!autoFlags[g], weapons: [] };
      for (const sid in weapons) {
        const w = D.WEAPONS[weapons[sid]];
        const g = w.mount === 'missile' ? 3 : (w.size === 'small' ? 2 : 1);
        groups[g].weapons.push(sid);
      }
      lo.groups = groups;
      run.stash.splice(stashIdx, 1);
      leftover.forEach(wid => run.stash.push(D.makeItem('weapon', wid)));
      run.log.push('旗舰改装为 ' + newHull.name);
      return { ok: true, msg: '旗舰已改装为 ' + newHull.name + (leftover.length ? '（' + leftover.length + ' 件武器卸入船舱）' : '') };
    },

    assignConsumable(run, slotIdx, stashIdx) {
      const item = run.stash[stashIdx];
      if (!item || item.type !== 'consumable') return { ok: false, msg: '无效物品' };
      const old = run.consSlots[slotIdx];
      if (old) run.stash.push(D.makeItem('consumable', old));
      run.consSlots[slotIdx] = item.id;
      run.stash.splice(stashIdx, 1);
      return { ok: true, msg: item.def.name + ' 已装入消耗槽 ' + (slotIdx + 1) };
    },

    unassignConsumable(run, slotIdx) {
      const id = run.consSlots[slotIdx];
      if (!id) return { ok: false, msg: '该槽位为空' };
      if (run.stash.length >= RunCore.stashCap(run)) return { ok: false, msg: '船舱已满，无法取出' };
      run.consSlots[slotIdx] = null;
      run.stash.push(D.makeItem('consumable', id));
      return { ok: true, msg: '已取出消耗品' };
    },

    /* ---------- 事件节点：4 选 1 事件类型 ---------- */
    genEventNode(run) {
      const types = [
        { id: 'merchant', icon: '🛒', name: '商人', w: 20, desc: '' },
        { id: 'encounter', icon: '⚔', name: '遭遇战', w: 16, desc: '与遭遇的敌舰队交战，无法挑选对手' },
        { id: 'treasure', icon: '🎁', name: '宝藏', w: 14, desc: '发现一批战利品，四选一' },
        { id: 'money', icon: '💰', name: '发现金钱', w: 12, desc: '一笔意外之财，多种处置方式' },
        { id: 'supply', icon: '⛽', name: '补给基地', w: 12, desc: '付费的永久改装服务' },
        { id: 'wreck', icon: '🪝', name: '神秘残骸', w: 10, desc: '高风险高回报的打捞' },
        { id: 'arsenal', icon: '🧪', name: '军械试验场', w: 9, desc: '按伤害类型挑选一件武器' },
        { id: 'merc', icon: '🏕', name: '雇佣兵营地', w: 8, desc: '免费招募僚舰' },
        { id: 'training', icon: '🏋', name: '训练场', w: 8, desc: '获得永久强化芯片' }
      ];
      // 加权抽取 4 个不重复的事件类型
      const picked = [];
      let pool = types.slice();
      while (picked.length < 4 && pool.length) {
        const total = pool.reduce((a, b) => a + b.w, 0);
        let r = Math.random() * total;
        let idx = 0;
        for (let i = 0; i < pool.length; i++) { r -= pool[i].w; if (r < 0) { idx = i; break; } }
        picked.push(pool[idx]);
        pool = pool.filter((_, i) => i !== idx);
      }
      // ★ 每轮（每天）保证至少刷新一个随机商人
      const merchantT = types[0];
      if (!run.dayMerchantSeen) {
        run.dayMerchantSeen = true;
        if (!picked.some(t => t.id === 'merchant')) {
          picked[Math.floor(Math.random() * picked.length)] = merchantT;
        }
      }
      // 构建选项（商人预滚动类型、遭遇战预滚动敌人）
      return picked.map(t => {
        const c = { id: t.id, icon: t.icon, name: t.name, desc: t.desc };
        if (t.id === 'merchant') {
          const m = D.MERCHANTS[Math.floor(Math.random() * D.MERCHANTS.length)];
          c.merchant = m;
          c.desc = m.icon + ' ' + m.name + ' · ' + m.desc;
        }
        if (t.id === 'encounter') {
          c.encounterInfo = RunCore.genEncounter(run);
          c.desc = '⚠ ' + c.encounterInfo.tpl.name + '（威胁 ' + c.encounterInfo.tpl.threat + '）';
        }
        return c;
      });
    },

    /** 遭遇战：不可选择敌人的强制战斗（奖励更丰厚） */
    genEncounter(run) {
      const pool = ['patrol', 'raiders'];
      if (run.day >= 2) pool.push('convoy', 'elite');
      if (run.day >= 3) pool.push('taskforce');
      if (run.day >= 4) pool.push('dread');
      const id = pool[Math.floor(Math.random() * pool.length)];
      const tpl = D.ENEMY_TEMPLATES[id];
      const gold = Math.max(1, Math.round((tpl.goldBase * 1.25 + run.day * 10) * (0.9 + Math.random() * 0.2)));
      const lootRarity = Math.random() < 0.8 ? D.rollRarity(run.day, 'small') : null;
      return { tpl, kind: 'small', gold, lootRarity, forced: true };
    },

    /** 进入选中事件类型的内容 */
    buildEvent(run, c) {
      switch (c.id) {
        case 'merchant': return RunCore.evMerchant(run, c.merchant);
        case 'encounter': return RunCore.evEncounter(run, c.encounterInfo);
        case 'treasure': return RunCore.evTreasure(run);
        case 'money': return RunCore.evMoney(run);
        case 'supply': return RunCore.evSupplyBase(run);
        case 'arsenal': return RunCore.evArsenal(run);
        case 'wreck': return RunCore.evWreck(run);
        case 'merc': return RunCore.evMerc(run);
        case 'training': return RunCore.evTraining(run);
      }
      return RunCore.evTreasure(run);
    },

    /** 商人库存：按稀有度与商人类型滚动商品 */
    rollMerchantItem(run, merchant, exclude) {
      const rarity = D.rollRarity(run.day, 'small');
      const pool = D.MERCHANT_POOLS[merchant.pool] || D.MERCHANT_POOLS.general;
      const avail = pool.filter(s => !exclude || exclude.indexOf(s) < 0);
      const byRarity = avail.filter(s => {
        const parts = s.split(':');
        const it = D.makeItem(parts[0], parts[1]);
        return it && it.rarity === rarity;
      });
      const cand = byRarity.length ? byRarity : (avail.length ? avail : pool);
      const s = cand[Math.floor(Math.random() * cand.length)];
      const parts = s.split(':');
      return D.makeItem(parts[0], parts[1]);
    },

    evMerchant(run, merchant) {
      const choices = [];
      const descs = [];
      for (let i = 0; i < 4; i++) {
        const item = RunCore.rollMerchantItem(run, merchant, descs);
        if (!item) continue;
        descs.push(item.type + ':' + item.id);
        const cost = Math.max(5, Math.round(item.value * 1.15 / 5) * 5);
        choices.push({
          id: 'c' + i, icon: D.ITEM_ICON[item.type], title: item.def.name,
          sub: item.def.desc || '', tag: cost + ' 金币', rarity: item.rarity, cost, used: false,
          _item: item,
          act: (state) => {
            if (state.gold < cost) return { done: false, msg: '金币不足！' };
            const res = RunCore.addToStash(state, item);
            if (res === 'full') return { done: false, full: true, item, payOnKeep: cost, msg: '船舱已满！丢弃一件物品即可完成购买' };
            state.gold -= cost;
            return { done: false, msg: '购入 ' + item.def.name };
          }
        });
      }
      // 清仓货架：常驻一件占位型廉价武器（树枝），半价出售
      const cheapId = D.CHEAP_WEAPONS[Math.floor(Math.random() * D.CHEAP_WEAPONS.length)];
      const citem = D.makeItem('weapon', cheapId);
      if (citem) {
        const ccost = Math.max(3, Math.round(citem.value * 0.5 / 5) * 5);
        choices.push({
          id: 'c4', icon: '🏷', title: citem.def.name + '（清仓）',
          sub: citem.def.desc + '<br><span style="color:var(--gold)">清仓特价：半价 · 性能差但便宜到离谱</span>',
          tag: ccost + ' 金币', rarity: 'common', cost: ccost, used: false, _item: citem,
          act: (state) => {
            if (state.gold < ccost) return { done: false, msg: '金币不足！' };
            const res = RunCore.addToStash(state, citem);
            if (res === 'full') return { done: false, full: true, item: citem, payOnKeep: ccost, msg: '船舱已满！丢弃一件物品即可完成购买' };
            state.gold -= ccost;
            return { done: false, msg: '购入 ' + citem.def.name };
          }
        });
      }
      return {
        type: 'merchant', title: merchant.icon + ' ' + merchant.name, multi: true,
        flavor: merchant.flavor,
        choices
      };
    },

    /** 军械试验场：按伤害类型各摆一件武器，只能取走一件（展示伤害体系） */
    evArsenal(run) {
      const choices = [];
      const DT = { kin: '动能', he: '高爆', frag: '破片', beam: '光束' };
      const dts = ['kin', 'he', 'frag', 'beam'];
      for (let i = 0; i < dts.length; i++) {
        const dt = dts[i];
        const rarity = D.rollRarity(run.day, 'small');
        const pool = [];
        for (const id in D.WEAPONS) {
          const w = D.WEAPONS[id];
          if (D.dtypeOf(w) !== dt) continue;
          const it = D.makeItem('weapon', id);
          if (it && it.rarity === rarity) pool.push(id);
        }
        if (!pool.length) {
          // 兜底：该类型任意武器
          for (const id in D.WEAPONS) {
            const w = D.WEAPONS[id];
            if (D.dtypeOf(w) === dt && D.makeItem('weapon', id)) pool.push(id);
          }
        }
        const id = pool[Math.floor(Math.random() * pool.length)];
        const item = D.makeItem('weapon', id);
        if (!item) continue;
        choices.push({
          id: 'c' + i, icon: '⚔', title: item.def.name,
          sub: item.def.desc || '', tag: DT[dt] + ' · ' + D.RARITY_LABEL[item.rarity], rarity: item.rarity, used: false,
          act: (state) => {
            const res = RunCore.addToStash(state, item);
            if (res === 'full') return { done: false, full: true, item, msg: '船舱已满！' };
            state.log.push('获得 ' + item.def.name);
            return { done: true, msg: '获得 ' + item.def.name };
          }
        });
      }
      return {
        type: 'arsenal', title: '军械试验场', multi: false,
        flavor: '一个废弃的联邦武器试验场。四个货架上分别摆着动能、高爆、破片与光束武器——只能取走一件。',
        choices
      };
    },

    evEncounter(run, info) {
      const ships = info.tpl.ships.map(pid => D.PRESETS[pid] ? D.PRESETS[pid].name.split('·')[0] : pid).join('、');
      return {
        type: 'encounter', title: '遭遇战', multi: false,
        flavor: '敌舰队突然出现在航线上，避无可避！',
        choices: [{
          id: 'fight', icon: '⚔', title: info.tpl.name + '（威胁 ' + info.tpl.threat + '）',
          sub: ships + '<br>' + info.tpl.desc,
          tag: '💰 ' + info.gold + ' 金币' + (info.lootRarity ? ' · 🎁 <span style="color:' + D.RARITY_COLOR[info.lootRarity] + '">' + D.RARITY_LABEL[info.lootRarity] + ' 掉落</span>' : '') + ' · 点击迎战',
          rarity: info.tpl.threat >= 6 ? 'legendary' : (info.tpl.threat >= 5 ? 'epic' : 'rare'),
          used: false,
          act: () => {
            return { startBattle: true, info: info };
          }
        }]
      };
    },

    evTreasure(run) {
      const choices = [];
      const descs = [];
      for (let i = 0; i < 4; i++) {
        const rarity = D.rollRarity(run.day, 'small');
        const item = D.rollItem(rarity, descs);
        if (!item) continue;
        descs.push(item.type + ':' + item.id);
        choices.push({
          id: 'c' + i, icon: D.ITEM_ICON[item.type], title: item.def.name,
          sub: item.def.desc || '', tag: D.RARITY_LABEL[item.rarity], rarity: item.rarity, used: false,
          act: (state) => {
            const res = RunCore.addToStash(state, item);
            if (res === 'full') return { done: false, full: true, item, msg: '船舱已满！' };
            state.log.push('获得 ' + item.def.name);
            return { done: true, msg: '获得 ' + item.def.name };
          }
        });
      }
      return {
        type: 'treasure', title: '宝藏', multi: false,
        flavor: '联邦时代的沉船残骸中发现一只密封物资箱。你只能拿走一样。',
        choices
      };
    },

    evMoney(run) {
      const day = run.day;
      const X = 24 + 8 * day;
      const opts = [
        { id: 'c0', icon: '🪙', title: '拾取金币袋', sub: '稳定获得 ' + X + ' 金币', tag: '安全', used: false,
          act: (state) => {
            state.gold += X;
            return { done: false, msg: '+' + X + ' 金币' };
          } },
        { id: 'c1', icon: '🤿', title: '打捞沉船货舱', sub: '65% 概率获得 ' + Math.round(2 * X) + ' 金币', tag: '赌博', used: false,
          act: (state) => {
            if (Math.random() < 0.65) {
              const g = Math.round(2 * X);
              state.gold += g;
              return { done: false, msg: '打捞成功！+' + g + ' 金币' };
            }
            return { done: false, msg: '货舱空空如也……' };
          } },
        { id: 'c2', icon: '🔩', title: '拆解残骸', sub: '稳定获得 ' + Math.round(0.6 * X) + ' 金币', tag: '稳定', used: false,
          act: (state) => {
            const g = Math.round(0.6 * X);
            state.gold += g;
            return { done: false, msg: '+' + g + ' 金币' };
          } },
        { id: 'c3', icon: '📈', title: '投资走私商队', sub: '55% 概率 +' + Math.round(2.6 * X) + '，否则损失 ' + Math.round(0.6 * X) + ' 金币', tag: '高风险', used: false,
          act: (state) => {
            if (Math.random() < 0.55) {
              const g = Math.round(2.6 * X);
              state.gold += g;
              return { done: false, msg: '投资翻倍！+' + g + ' 金币' };
            }
            const loss = Math.min(state.gold, Math.round(0.6 * X));
            state.gold -= loss;
            return { done: false, msg: '商队被海盗劫了，损失 ' + loss + ' 金币……' };
          } }
      ];
      return {
        type: 'money', title: '发现金钱', multi: false,
        flavor: '海面上漂着几箱联邦旧币——也可能是陷阱。怎么处置？',
        choices: opts
      };
    },

    evSupplyBase(run) {
      const day = run.day;
      const opts = [
        { id: 'c0', icon: '🛡', title: '装甲镀层', sub: '装甲永久 +20%', tag: (40 + 8 * day) + ' 金币', cost: 40 + 8 * day, used: false,
          act: (state) => {
            if (state.gold < opts[0].cost) return { done: false, msg: '金币不足！' };
            state.gold -= opts[0].cost;
            const u = state.flagship.upgrades;
            u.up_armor = (u.up_armor || 0) + 1;
            return { done: false, msg: '装甲 +20%！' };
          } },
        { id: 'c1', icon: '⛑', title: '船体加固', sub: '最大船体永久 +15%', tag: (40 + 8 * day) + ' 金币', cost: 40 + 8 * day, used: false,
          act: (state) => {
            if (state.gold < opts[1].cost) return { done: false, msg: '金币不足！' };
            state.gold -= opts[1].cost;
            const u = state.flagship.upgrades;
            u.up_hull = (u.up_hull || 0) + 1;
            return { done: false, msg: '最大船体 +15%！' };
          } },
        { id: 'c2', icon: '⚙', title: '轮机维护', sub: '最大航速永久 +8%', tag: (35 + 7 * day) + ' 金币', cost: 35 + 7 * day, used: false,
          act: (state) => {
            if (state.gold < opts[2].cost) return { done: false, msg: '金币不足！' };
            state.gold -= opts[2].cost;
            const u = state.flagship.upgrades;
            u.up_speed = (u.up_speed || 0) + 1;
            return { done: false, msg: '最大航速 +8%！' };
          } },
        { id: 'c3', icon: '💰', title: '补给采购', sub: '获得一批免费补给', tag: '免费', used: false,
          act: (state) => {
            const g = 20 + 6 * day;
            state.gold += g;
            return { done: false, msg: '补给折算 +' + g + ' 金币' };
          } }
      ];
      return {
        type: 'supply', title: '补给基地', multi: false,
        flavor: '一座联邦遗留的移动补给站向你的舰队开放，这里提供付费的永久改装服务。',
        choices: opts
      };
    },

    evMerc(run) {
      const choices = [];
      const ids = Object.keys(D.ESCORT_CARDS).sort(() => Math.random() - 0.5).slice(0, 3);
      ids.forEach((id, i) => {
        const card = D.ESCORT_CARDS[id];
        choices.push({
          id: 'c' + i, icon: '🚢', title: card.name,
          sub: card.desc, tag: '免费招募', rarity: card.rarity, used: false,
          act: (state) => {
            return RunCore.mercenaryRecruit(state, id);
          }
        });
      });
      choices.push({
        id: 'c3', icon: '🍻', title: '犒劳水手', sub: '提升士气，获得金币', tag: '免费', used: false,
        act: (state) => {
          const g = 15 + 5 * run.day;
          state.gold += g;
          return { done: false, msg: '士气高涨，+ ' + g + ' 金币' };
        }
      });
      return {
        type: 'merc', title: '雇佣兵营地', multi: false,
        flavor: '锚地的佣兵营地，一群拿钱办事的老兵。',
        choices
      };
    },

    /** 佣兵招募：有槽直接加入，无槽返回 replace 提示 */
    mercenaryRecruit(state, cardId) {
      const card = D.ESCORT_CARDS[cardId];
      if (state.escorts.length < RunCore.escortSlots(state)) {
        state.escorts.push(RunCore.makeEscort(cardId));
        state.log.push(card.name + ' 加入编队');
        return { done: false, msg: card.name + ' 加入编队！' };
      }
      return { done: false, replace: true, cardId, msg: '僚舰位已满，需替换现有僚舰' };
    },

    evWreck(run) {
      const day = run.day;
      const opts = [
        { id: 'c0', icon: '🪝', title: '打捞残骸', sub: '70% 概率获得稀有物品，失败也有废铁保底', tag: '赌博', used: false,
          act: (state) => {
            if (Math.random() < 0.7) {
              const item = D.rollItem('rare');
              const res = RunCore.addToStash(state, item);
              if (res === 'full') return { done: false, full: true, item, msg: '打捞出 ' + item.def.name + '，但船舱已满！' };
              return { done: false, msg: '打捞出 ' + item.def.name + '（' + D.RARITY_LABEL[item.rarity] + '）！' };
            }
            // 保底：捞到废铁也能拆点钱，避免纯失败挫败感
            const g = 10 + 3 * day;
            state.gold += g;
            return { done: false, msg: '只捞到几块破木板，拆出卖了 +' + g + ' 金币……' };
          } },
        { id: 'c1', icon: '🎲', title: '深入打捞', sub: '45% 概率获得史诗物品，否则损失 15% 金币', tag: '高风险', used: false,
          act: (state) => {
            if (Math.random() < 0.45) {
              const item = D.rollItem('epic');
              const res = RunCore.addToStash(state, item);
              if (res === 'full') return { done: false, full: true, item, msg: '打捞出 ' + item.def.name + '，但船舱已满！' };
              return { done: false, msg: '打捞出 ' + item.def.name + '（' + D.RARITY_LABEL[item.rarity] + '）！' };
            }
            const loss = Math.max(5, Math.round(state.gold * 0.15));
            state.gold -= loss;
            return { done: false, msg: '水下暗流吞噬了打捞队，损失 ' + loss + ' 金币……' };
          } },
        { id: 'c2', icon: '🔩', title: '拆解装甲', sub: '回收残骸钢材换取金币', tag: '稳定', used: false,
          act: (state) => {
            const g = 18 + 4 * day;
            state.gold += g;
            return { done: false, msg: '拆解回收 +' + g + ' 金币' };
          } },
        { id: 'c3', icon: '🚶', title: '谨慎离开', sub: '这里有些不对劲', tag: '安全', used: false,
          act: (state) => {
            state.gold += 6;
            return { done: false, msg: '安全离开，+6 金币' };
          } },
        { id: 'c4', icon: '⚙', title: '拆卸炮塔', sub: '65% 概率获得一件稀有武器，失败有废铁保底', tag: '赌博', used: false,
          act: (state) => {
            if (Math.random() < 0.65) {
              const item = D.rollItem('rare');
              const res = RunCore.addToStash(state, item);
              if (res === 'full') return { done: false, full: true, item, msg: '拆出 ' + item.def.name + '，但船舱已满！' };
              return { done: false, msg: '拆出 ' + item.def.name + '（' + D.RARITY_LABEL[item.rarity] + '）！' };
            }
            const g = 12 + 3 * day;
            state.gold += g;
            return { done: false, msg: '炮塔锈死在基座上，只撬下几块废铁卖了 +' + g + ' 金币……' };
          } }
      ];
      return {
        type: 'wreck', title: '神秘残骸', multi: false,
        flavor: '半艘联邦巨舰的残骸搁浅在礁石上，船艏的炮塔仍指向天空。',
        choices: opts
      };
    },

    evTraining(run) {
      const choices = [];
      const descs = [];
      const rarities = ['common', 'common', 'rare', 'rare'];
      for (let i = 0; i < 4; i++) {
        const item = D.rollItem(rarities[i], descs);
        if (!item || item.type !== 'upgrade') {
          // 保底：直接取池中某个升级
          const pool = rarities[i] === 'rare'
            ? ['upgrade:up_op6', 'upgrade:up_diss', 'upgrade:up_cap', 'upgrade:up_range', 'upgrade:up_ammo', 'upgrade:up_repair', 'upgrade:up_gold']
            : ['upgrade:up_hull', 'upgrade:up_armor', 'upgrade:up_speed', 'upgrade:up_turn'];
          const s = pool[Math.floor(Math.random() * pool.length)];
          const parts = s.split(':');
          const it = D.makeItem(parts[0], parts[1]);
          descs.push(it.type + ':' + it.id);
          choices.push(RunCore.makeTrainingChoice(i, it));
          continue;
        }
        descs.push(item.type + ':' + item.id);
        choices.push(RunCore.makeTrainingChoice(i, item));
      }
      return {
        type: 'training', title: '舰队训练场', multi: false,
        flavor: '你的水兵们在甲板上操练。教官建议强化一项永久能力。',
        choices
      };
    },

    makeTrainingChoice(i, item) {
      return {
        id: 'c' + i, icon: '⬆', title: item.def.name,
        sub: item.def.desc, tag: D.RARITY_LABEL[item.rarity], rarity: item.rarity, used: false,
        act: (state) => {
          const res = RunCore.addToStash(state, item);
          if (res === 'full') return { done: false, full: true, item, msg: '船舱已满！' };
          return { done: true, msg: '获得 ' + item.def.name };
        }
      };
    },

    /* ---------- 战斗 ---------- */
    /** 强制战斗（战斗节点不可选敌）：小战斗=掉落，大战斗=关卡考验 */
    genForcedBattle(run, kind) {
      const pool = D.forcedPool(kind, run.day);
      const id = pool[Math.floor(Math.random() * pool.length)];
      const tpl = D.ENEMY_TEMPLATES[id];
      let gold, lootRarity;
      if (kind === 'small') {
        gold = Math.max(1, Math.round((tpl.goldBase * 0.8 + run.day * 6) * (0.9 + Math.random() * 0.2)));
        lootRarity = D.rollRarity(run.day, 'small'); // 小战斗必定掉落
      } else {
        gold = Math.max(1, Math.round((tpl.goldBase * 1.3 + run.day * 14) * (0.9 + Math.random() * 0.2)));
        lootRarity = D.rollRarity(run.day, 'big');
      }
      return { tpl, kind, gold, lootRarity, forced: true };
    },

    genLoot(run, rarity) {
      const items = [];
      const descs = [];
      for (let i = 0; i < 4; i++) {
        const it = D.rollItem(rarity, descs);
        if (!it) continue;
        descs.push(it.type + ':' + it.id);
        items.push(it);
      }
      return items;
    },

    buildBattleCfg(run, info) {
      RunCore.normalizeEscorts(run);
      const escorts = run.escorts.map(e => ({ loadout: e.loadout, persona: e.persona || 'steady' }));
      return {
        loadout: run.flagship,
        escorts,
        difficultyId: 'skirmish',
        enemyPresets: info.tpl.ships.slice(),
        enemySkill: D.enemySkill(run.day, info.tpl.threat),
        enemyScale: D.enemyScale(run.day, info.tpl.threat),
        allyScale: D.allyScale(run.day),
        consumables: run.consSlots.slice(),
        battleInfo: info
      };
    },

    /** 战斗胜利结算（失败返回 {defeat:true}） */
    resolveBattle(run, won, info, game) {
      run.stat.battles++;
      if (!won) return { defeat: true };
      run.stat.kills += game ? game.stats.enemiesSunk : info.tpl.ships.length;
      const gold = Math.round(info.gold * RunCore.goldMult(run));
      run.gold += gold;
      run.stat.goldEarned += gold;
      // 消耗品已使用 → 清除
      if (game && game.usedConsumables) {
        for (let i = 0; i < 3; i++) {
          if (game.usedConsumables[i]) run.consSlots[i] = null;
        }
      }
      const phaseRes = RunCore.completePhase(run);
      return Object.assign({ defeat: false, gold, lootRarity: info.lootRarity, big: info.kind === 'big' }, phaseRes);
    }
  };

  /* ============================================================
     RunApp DOM 交互层
     ============================================================ */
  const RunApp = {
    run: null,
    pendingEvent: null,
    pendingNode: null,
    pendingBattle: null,
    toastTimer: 0,

    init() {
      // 菜单按钮（主菜单的新远征/继续按钮由 main.js 绑定，避免双重触发）
      const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.onclick = fn;
      };
      bind('btn-run-menu', () => RunApp.showMenuOverlay(true));
      bind('btn-run-menu-resume', () => RunApp.showMenuOverlay(false));
      bind('btn-run-menu-save', () => {
        RunApp.save();
        MainApp.show('menu');
      });
      bind('btn-run-menu-abandon', () => {
        Store.remove('sb_run');
        MainApp.updateMenu();
        MainApp.show('menu');
      });
      bind('btn-run-hold', () => RunApp.openHold());
      bind('btn-advance', () => RunApp.advance());
      bind('btn-event-leave', () => RunApp.completeEvent());
      bind('btn-hold-back', () => RunApp.restoreFromHold());
      bind('btn-defeat-restart', () => RunApp.newRun());
      bind('btn-defeat-menu', () => MainApp.show('menu'));
      bind('btn-victory-continue', () => {
        document.getElementById('run-end').classList.add('hidden');
        RunApp.toast('继续远征！敌军将更加强大。');
      });
      bind('btn-victory-end', () => {
        const meta = Store.get('sb_meta', {});
        meta.wins = (meta.wins || 0) + 1;
        Store.set('sb_meta', meta);
        Store.remove('sb_run');
        MainApp.updateMenu();
        MainApp.show('menu');
      });
    },

    newRun() {
      this.run = RunCore.newRun();
      this.pendingEvent = null;
      this.pendingNode = null;
      this.pendingBattle = null;
      this.selSlot = null;
      this.save();
      MainApp.updateMenu();
      MainApp.show('run');
      this.setView('map');
      this.renderMap();
      this.toast('拾荒远征开始！每天航线：(事件×3 + 小战斗)×3，最后大战斗考验');
    },

    continueRun() {
      const s = Store.get('sb_run');
      if (!s || !s.version) { this.newRun(); return; }
      this.run = s;
      RunCore.normalizeEscorts(this.run);
      this.pendingEvent = null;
      this.pendingNode = null;
      this.pendingBattle = null;
      this.selSlot = null;
      MainApp.show('run');
      this.setView('map');
      this.renderMap();
      this.toast('继续远征：第 ' + s.day + ' 天');
    },

    save() {
      if (this.run) Store.set('sb_run', this.run);
    },

    /* ---------- 视图 ---------- */
    setView(v) {
      const views = { map: 'view-map', event: 'view-event', battle: 'view-battle', hold: 'view-hold', refit: 'view-refit' };
      for (const k in views) {
        document.getElementById(views[k]).classList.toggle('hidden', views[k] !== views[v]);
      }
      if (v === 'hold') HoldApp.render();
      if (v === 'refit') RefitApp.render();
    },

    openHold() {
      this.setView('hold');
    },

    openRefit() {
      this.setView('refit');
    },

    /* ---------- 地图 ---------- */
    renderMap() {
      const run = this.run;
      document.getElementById('run-day').textContent = run.day;
      document.getElementById('run-gold').textContent = run.gold;
      const cap = RunCore.stashCap(run);
      document.getElementById('run-stash-info').textContent = run.stash.length + '/' + cap;
      const op = RunCore.opUsed(run), opMax = RunCore.opMax(run);
      const opEl = document.getElementById('run-op-info');
      opEl.textContent = op + '/' + opMax;
      opEl.style.color = op > opMax ? 'var(--red)' : '';
      // 阶段轨道
      const track = document.getElementById('run-phase-track');
      let html = '';
      for (let i = 0; i < RunCore.SEQ.length; i++) {
        const p = RunCore.SEQ[i];
        const cls = i === run.phaseIdx ? 'node now' : (i < run.phaseIdx ? 'node done' : 'node');
        html += '<div class="' + cls + '"><span class="node-ico">' + RunCore.PHASE_ICON[p] + '</span><span class="node-lbl">' + RunCore.PHASE_LABEL[p] + '</span></div>';
        if (i < RunCore.SEQ.length - 1) html += '<div class="node-arrow">→</div>';
      }
      track.innerHTML = html;
      // 舰队概况
      const lo = run.flagship;
      const hull = D.HULLS[lo.hullId];
      const esc = run.escorts.map(e => (e.cardId && D.ESCORT_CARDS[e.cardId]) ? D.ESCORT_CARDS[e.cardId].name : '?').join('、') || '无';
      const st = RunCore.stats(run);
      document.getElementById('route-desc').innerHTML =
        '<div class="route-ship">🚩 旗舰 <b>' + lo.name + '</b>（' + hull.name + '）</div>' +
        '<div class="route-ship">🚢 僚舰：' + esc + ' <span class="hint">（' + run.escorts.length + '/' + RunCore.escortSlots(run) + '）</span></div>' +
        '<div class="route-ship">🏺 遗物：' + lo.relics.length + '/' + RunCore.relicSlots(run) + ' · 🧰 消耗品：' + run.consSlots.filter(Boolean).length + '/3</div>' +
        '<div class="route-ship hint">耐久 ' + Math.round(st.hull) + ' · 装甲 ' + Math.round(st.armor) + ' · 航速 ' + D.knots(st.maxSpeed) + ' 节' +
        ' · 散热 ' + Math.round(st.heatDiss) + '/s · 热容 ' + Math.round(st.heatCap) + '</div>';
      document.getElementById('route-log').innerHTML = run.log.slice(-6).map(s => '<div class="log-line">' + s + '</div>').join('');
      const btn = document.getElementById('btn-advance');
      btn.textContent = run.phaseIdx >= 6 ? '☀ 新的一天' : '⛵ 启航 → ' + RunCore.PHASE_LABEL[RunCore.SEQ[run.phaseIdx]];
    },

    advance() {
      const run = this.run;
      const phase = RunCore.SEQ[run.phaseIdx];
      if (phase === 'event') {
        // 第一层：4 选 1 事件类型（不可返回，选定即出发）
        if (this.pendingNode && !this.pendingEvent) {
          this.renderNode();
          this.setView('event');
          return;
        }
        this.pendingNode = RunCore.genEventNode(run);
        this.pendingEvent = null;
        this.renderNode();
        this.setView('event');
      } else {
        // 强制战斗（不可选敌）
        if (!this.pendingBattle) this.pendingBattle = RunCore.genForcedBattle(run, phase);
        this.renderForcedBattle(phase);
        this.setView('battle');
      }
    },

    /** 从船舱返回：回到进入船舱前的当前轮次页面（路由同步） */
    restoreFromHold() {
      this.selSlot = null;
      if (this.pendingBattle) {
        this.renderForcedBattle(this.pendingBattle.kind);
        this.setView('battle');
      } else if (this.pendingEvent) {
        this.renderEvent();
        this.setView('event');
      } else if (this.pendingNode) {
        this.renderNode();
        this.setView('event');
      } else {
        this.setView('map');
        this.renderMap();
      }
    },

    /* ---------- 事件节点视图（4 选 1 事件类型） ---------- */
    renderNode() {
      const grid = document.getElementById('event-choices');
      grid.innerHTML = '';
      document.getElementById('event-title').textContent = '航路遭遇 · 选择其一（不可反悔）';
      document.getElementById('event-flavor').textContent = '前方海面传来不同的信号——一旦选择，必须前往。每轮必有一位商人出现。';
      for (const c of this.pendingNode) {
        const card = document.createElement('div');
        card.className = 'choice-card';
        if (c.id === 'merchant') card.style.borderColor = D.RARITY_COLOR.legendary;
        if (c.id === 'encounter') card.style.borderColor = D.RARITY_COLOR.epic;
        card.innerHTML =
          '<div class="cc-ico">' + c.icon + '</div>' +
          '<div class="cc-name">' + c.name + '</div>' +
          '<div class="cc-sub">' + c.desc + '</div>' +
          '<div class="cc-tag">进入 →</div>';
        card.addEventListener('click', () => RunApp.enterEvent(c));
        grid.appendChild(card);
      }
      document.getElementById('btn-event-leave').classList.add('hidden');
    },

    /** 进入选中事件类型的内容 */
    enterEvent(c) {
      this.pendingEvent = RunCore.buildEvent(this.run, c);
      this.renderEvent();
    },

    /* ---------- 事件视图 ---------- */
    renderEvent() {
      const ev = this.pendingEvent;
      document.getElementById('event-title').textContent = ev.title;
      document.getElementById('event-flavor').textContent = ev.flavor;
      const grid = document.getElementById('event-choices');
      grid.innerHTML = '';
      for (const c of ev.choices) {
        const card = document.createElement('div');
        card.className = 'choice-card' + (c.used ? ' used' : '');
        if (c.rarity) card.style.borderColor = D.RARITY_COLOR[c.rarity];
        card.innerHTML =
          '<div class="cc-ico">' + c.icon + '</div>' +
          '<div class="cc-name">' + c.title + (c.rarity ? ' <span style="color:' + D.RARITY_COLOR[c.rarity] + ';font-size:10px">[' + D.RARITY_LABEL[c.rarity] + ']</span>' : '') + '</div>' +
          '<div class="cc-sub">' + c.sub + '</div>' +
          '<div class="cc-tag">' + c.tag + '</div>';
        card.addEventListener('click', () => RunApp.onChoice(c, ev));
        grid.appendChild(card);
      }
      // 仅商人等多选事件可多次操作后离开
      document.getElementById('btn-event-leave').classList.toggle('hidden', !ev.multi);
    },

    onChoice(c, ev) {
      if (c.used) return;
      const run = this.run;
      const res = c.act(run);
      if (res.msg) this.toast(res.msg);
      // 遭遇战：直接开战（不可选择敌人）
      if (res.startBattle) {
        c.used = true;
        this.save();
        this.startBattle(res.info);
        return;
      }
      if (res.full) {
        this.discardModal(res.item, (kept) => {
          if (kept && res.payOnKeep) {
            this.run.gold -= res.payOnKeep;
            this.save();
          }
          if (ev.multi) this.renderEvent(); else this.completeEvent();
        });
        return;
      }
      if (res.replace) {
        this.escortModal(res.cardId, (idx) => {
          if (idx >= 0) {
            this.run.escorts[idx] = RunCore.makeEscort(res.cardId);
            this.run.log.push('僚舰替换为 ' + D.ESCORT_CARDS[res.cardId].name);
            c.used = true;
            this.save();
            this.toast(D.ESCORT_CARDS[res.cardId].name + ' 加入编队！');
          }
          this.renderEvent();
        });
        return;
      }
      c.used = true;
      this.save();
      if (ev.multi) {
        this.renderEvent();
      } else {
        this.completeEvent();
      }
    },

    completeEvent() {
      this.pendingNode = null;
      this.pendingEvent = null;
      this.pendingBattle = null;
      const res = RunCore.completePhase(this.run);
      this.save();
      this.setView('map');
      this.renderMap();
      if (res.dayUp) this.toast('☀ 第 ' + this.run.day + ' 天开始！船舱容量提升至 ' + RunCore.stashCap(this.run));
      if (res.victory) this.victoryOverlay();
    },

    /* ---------- 强制战斗（战斗节点不可选敌） ---------- */
    renderForcedBattle(phase) {
      const info = this.pendingBattle;
      if (!info) { this.setView('map'); return; }
      const grid = document.getElementById('battle-choices');
      grid.innerHTML = '';
      const tpl = info.tpl;
      const card = document.createElement('div');
      card.className = 'choice-card battle-card';
      const threatCls = tpl.threat >= 7 ? 'threat-boss' : (tpl.threat >= 5 ? 'threat-hard' : '');
      const ships = tpl.ships.map(pid => D.PRESETS[pid] ? D.PRESETS[pid].name.split('·')[0] : pid).join('、');
      card.innerHTML =
        '<div class="cc-ico">' + (tpl.threat >= 6 ? '👑' : '⚓') + '</div>' +
        '<div class="cc-name">' + tpl.name + '</div>' +
        '<div class="threat ' + threatCls + '">' + '★'.repeat(Math.min(5, tpl.threat - 1)) + (tpl.threat >= 6 ? '⭐' : '') + ' 威胁 ' + tpl.threat + '</div>' +
        '<div class="cc-sub">' + ships + '</div>' +
        '<div class="cc-sub hint">' + tpl.desc + '</div>' +
        '<div class="cc-tag">💰 ' + info.gold + ' 金币 · 🎁 <span style="color:' + D.RARITY_COLOR[info.lootRarity] + '">' + D.RARITY_LABEL[info.lootRarity] + ' 掉落</span> · 点击迎战</div>';
      card.addEventListener('click', () => RunApp.startBattle(info));
      grid.appendChild(card);
      const title = document.querySelector('#view-battle .panel-title');
      title.textContent = phase === 'big'
        ? '🔥 大战斗 · 关卡考验（敌军舰队拦截了航线）'
        : '⚔ 小战斗 · 战利品之战（遭遇敌军舰队）';
    },

    startBattle(info) {
      const cfg = RunCore.buildBattleCfg(this.run, info);
      cfg.onExit = (won, reason, game) => RunApp.afterBattle(won, reason, info, game);
      cfg.tutorial = !!RunApp.tutorialRun;
      RunApp.tutorialRun = false;
      BattleApp.start(cfg);
    },

    /* ---------- 独立教程战斗（不接远征，无 AI 威胁） ---------- */
    startTutorial() {
      const loadout = D.buildLoadout('lightCruiser', {
        sm1: 'pd_laser', sm2: 'pd_laser',
        md1: 'gun_130x2', md2: 'blaster_med',
        lg1: 'gun_305x2', ms1: 'torp_533'
      }, [], { player: true });
      const cfg = {
        loadout: loadout,
        tutorial: true,
        difficultyId: 'skirmish',
        onExit: (won, reason, game) => { this.stopTutorial(); }
      };
      BattleApp.start(cfg);
    },
    stopTutorial() { MainApp.show('menu'); },

    /* ---------- 航母测试战斗 ---------- */
    startCarrierTest() {
      const loadout = D.buildLoadout('carrier', {
        by1: 'fgt_bomber', by2: 'fgt_interceptor',
        sm1: 'gun_ac20', sm2: 'gun_flak', ms1: 'asm_small'
      }, ['hm_engine'], { player: true });
      const cfg = {
        loadout: loadout, difficultyId: 'skirmish',
        enemyPresets: ['dd_gun', 'dd_torp'],
        onExit: (won, reason, game) => { MainApp.show('menu'); }
      };
      BattleApp.start(cfg);
    },

    afterBattle(won, reason, info, game) {
      if (reason === 'abandon') {
        this.save();
        MainApp.show('menu');
        return;
      }
      if (!won) {
        this.save();
        this.runEnded(reason === 'retreat' ? '舰队选择了撤退，远征就此结束。' : '旗舰沉没，远征就此结束。');
        return;
      }
      const res = RunCore.resolveBattle(this.run, true, info, game);
      this.save();
      this.pendingNode = null;
      this.pendingEvent = null;
      this.pendingBattle = null;
      MainApp.show('run');
      this.setView('map');
      this.renderMap();
      if (res.victory) {
        this.victoryOverlay();
        return;
      }
      if (res.dayUp) {
        this.toast('☀ 第 ' + this.run.day + ' 天开始！船舱容量提升至 ' + RunCore.stashCap(this.run));
      } else {
        this.toast('⚔ 战斗胜利！金币 +' + res.gold + (res.lootRarity ? '，发现战利品！' : ''));
      }
      if (res.lootRarity) {
        this.lootModal(RunCore.genLoot(this.run, res.lootRarity));
      }
    },

    runEnded(msg) {
      const run = this.run;
      const score = Math.round(run.stat.kills * 120 + run.stat.goldEarned + run.stat.battles * 60 + (run.day - 1) * 400);
      const meta = Store.get('sb_meta', {});
      meta.bestDay = Math.max(meta.bestDay || 1, run.day);
      meta.bestScore = Math.max(meta.bestScore || 0, score);
      meta.runs = (meta.runs || 0) + 1;
      Store.set('sb_meta', meta);
      Store.remove('sb_run');
      MainApp.updateMenu();
      // 切换到远征界面并展示战败结算（独立结算层）
      MainApp.show('run');
      this.setView('map');
      this.renderMap();
      const ov = document.getElementById('run-end');
      ov.innerHTML =
        '<div class="overlay-box panel result-box"><div class="overlay-title defeat">战 斗 失 败</div>' +
        '<div class="result-stats">' + msg + '<br>—— 本次远征总结 ——<br>' +
        '坚持到 <b>第 ' + run.day + ' 天</b> · 击沉敌舰 <b>' + run.stat.kills + '</b> 艘<br>' +
        '战斗 <b>' + run.stat.battles + '</b> 场 · 获得金币 <b>' + run.stat.goldEarned + '</b><br>' +
        '总 分：<b style="color:#ffd27a;font-size:20px">' + score + '</b> · 历史最高 <b>' + (meta.bestScore || 0) + '</b><br>' +
        '最远航程：<b>第 ' + meta.bestDay + ' 天</b></div>' +
        '<div class="overlay-btns"><button id="btn-defeat-restart" class="btn btn-primary">再次远征</button>' +
        '<button id="btn-defeat-menu" class="btn">返回主菜单</button></div></div>';
      ov.classList.remove('hidden');
      document.getElementById('btn-defeat-restart').onclick = () => {
        ov.classList.add('hidden');
        RunApp.newRun();
      };
      document.getElementById('btn-defeat-menu').onclick = () => {
        ov.classList.add('hidden');
        MainApp.show('menu');
      };
      this.run = null;
    },

    victoryOverlay() {
      this.run.endless = true;
      this.save();
      const score = Math.round(this.run.stat.kills * 120 + this.run.stat.goldEarned + this.run.stat.battles * 60 + (this.run.day - 1) * 400 + 1000);
      const meta = Store.get('sb_meta', {});
      meta.bestDay = Math.max(meta.bestDay || 1, 5);
      meta.bestScore = Math.max(meta.bestScore || 0, score);
      Store.set('sb_meta', meta);
      const ov = document.getElementById('run-end');
      ov.innerHTML =
        '<div class="overlay-box panel result-box"><div class="overlay-title victory">🏆 远 征 胜 利</div>' +
        '<div class="result-stats">你击溃了北境军阀的全部主力，冰冠号沉入冰海！<br>' +
        '战斗 <b>' + this.run.stat.battles + '</b> 场 · 击沉 <b>' + this.run.stat.kills + '</b> 艘 · 金币 <b>' + this.run.stat.goldEarned + '</b><br>' +
        '总 分：<b style="color:#ffd27a;font-size:20px">' + score + '</b> · 历史最高 <b>' + meta.bestScore + '</b><br>' +
        '船舱最终容量 <b>' + RunCore.stashCap(this.run) + '</b> · 旗舰 <b>' + this.run.flagship.name + '</b></div>' +
        '<div class="overlay-btns"><button id="btn-victory-continue" class="btn btn-primary">继续远征（无尽模式）</button>' +
        '<button id="btn-victory-end" class="btn">结束远征</button></div></div>';
      ov.classList.remove('hidden');
      document.getElementById('btn-victory-continue').onclick = () => {
        ov.classList.add('hidden');
        RunApp.toast('继续远征！敌军将更加强大。');
      };
      document.getElementById('btn-victory-end').onclick = () => {
        ov.classList.add('hidden');
        const m2 = Store.get('sb_meta', {});
        m2.wins = (m2.wins || 0) + 1;
        Store.set('sb_meta', m2);
        Store.remove('sb_run');
        MainApp.updateMenu();
        MainApp.show('menu');
      };
    },

    /* ---------- 弹窗：战利品 / 丢弃 / 僚舰替换 / 菜单 ---------- */
    lootModal(items) {
      const ov = document.getElementById('run-end');
      let html = '<div class="overlay-box panel result-box"><div class="overlay-title victory">🎁 战利品选择</div>' +
        '<div class="loot-grid">';
      items.forEach((it, i) => {
        html += '<div class="choice-card loot-card" data-idx="' + i + '" style="border-color:' + D.RARITY_COLOR[it.rarity] + '">' +
          '<div class="cc-ico">' + D.ITEM_ICON[it.type] + '</div>' +
          '<div class="cc-name">' + it.def.name + ' <span style="color:' + D.RARITY_COLOR[it.rarity] + ';font-size:10px">[' + D.RARITY_LABEL[it.rarity] + ']</span></div>' +
          '<div class="cc-sub">' + (it.def.desc || '') + '</div>' +
          '<div class="cc-tag">选择一件带走</div></div>';
      });
      html += '</div></div>';
      ov.innerHTML = html;
      ov.classList.remove('hidden');
      ov.querySelectorAll('.loot-card').forEach(card => {
        card.onclick = () => {
          const item = items[parseInt(card.dataset.idx, 10)];
          const res = RunCore.addToStash(this.run, item);
          if (res === 'full') {
            ov.classList.add('hidden');
            this.discardModal(item, () => {});
          } else {
            this.run.log.push('获得 ' + item.def.name);
            ov.classList.add('hidden');
            this.save();
            this.renderMap();
            this.toast('获得 ' + item.def.name);
          }
        };
      });
    },

    discardModal(item, onResolve) {
      const ov = document.getElementById('run-end');
      const cap = RunCore.stashCap(this.run);
      let html = '<div class="overlay-box panel result-box"><div class="overlay-title" style="font-size:20px;color:#ffab45">船舱已满 (' + this.run.stash.length + '/' + cap + ')</div>' +
        '<div class="result-stats">新物品：<b>' + D.ITEM_ICON[item.type] + ' ' + item.def.name + '</b> 无法放入船舱。<br>选择一件物品丢弃以腾出空间：</div>' +
        '<div class="discard-grid">';
      this.run.stash.forEach((it, i) => {
        html += '<div class="choice-card discard-card" data-idx="' + i + '" style="border-color:' + D.RARITY_COLOR[it.rarity] + '">' +
          '<div class="cc-ico">' + D.ITEM_ICON[it.type] + '</div><div class="cc-name">' + it.def.name + '</div></div>';
      });
      html += '</div><div class="overlay-btns"><button id="btn-discard-skip" class="btn">放弃新物品</button></div></div>';
      ov.innerHTML = html;
      ov.classList.remove('hidden');
      ov.querySelectorAll('.discard-card').forEach(card => {
        card.onclick = () => {
          const idx = parseInt(card.dataset.idx, 10);
          const dropped = this.run.stash[idx];
          RunCore.forceAdd(this.run, item, idx);
          this.run.log.push('丢弃 ' + dropped.def.name + '，获得 ' + item.def.name);
          ov.classList.add('hidden');
          this.save();
          this.renderMap();
          this.toast('获得 ' + item.def.name);
          onResolve(true);
        };
      });
      document.getElementById('btn-discard-skip').onclick = () => {
        ov.classList.add('hidden');
        this.toast('放弃 ' + item.def.name);
        onResolve(false);
      };
    },

    escortModal(cardId, onPick) {
      const ov = document.getElementById('run-end');
      const card = D.ESCORT_CARDS[cardId];
      let html = '<div class="overlay-box panel result-box"><div class="overlay-title" style="font-size:20px">替换僚舰</div>' +
        '<div class="result-stats">新僚舰：<b>' + card.name + '</b><br>选择被替换的现有僚舰：</div><div class="discard-grid">';
      this.run.escorts.forEach((id, i) => {
        const c = D.ESCORT_CARDS[id];
        html += '<div class="choice-card discard-card" data-idx="' + i + '"><div class="cc-ico">🚢</div><div class="cc-name">' + (c ? c.name : '?') + '</div></div>';
      });
      html += '</div><div class="overlay-btns"><button id="btn-esc-skip" class="btn">取消招募</button></div></div>';
      ov.innerHTML = html;
      ov.classList.remove('hidden');
      ov.querySelectorAll('.discard-card').forEach(cardEl => {
        cardEl.onclick = () => {
          ov.classList.add('hidden');
          onPick(parseInt(cardEl.dataset.idx, 10));
        };
      });
      document.getElementById('btn-esc-skip').onclick = () => {
        ov.classList.add('hidden');
        onPick(-1);
      };
    },

    showMenuOverlay(show) {
      document.getElementById('run-menu').classList.toggle('hidden', !show);
    },

    toast(msg) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.classList.remove('hidden');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
    }
  };

  globalThis.RunCore = RunCore;
  globalThis.RunApp = RunApp;
})();
