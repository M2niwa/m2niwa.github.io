/* ============================================================
   世界地图：纯数据（游戏无关，可迁移 Godot）
   地形特性 / 殖民地特性 / 物品 / 耗水档位 / 区域 / 殖民地 / 势力 / 舰队模板
   ============================================================ */
(function () {
  'use strict';

  /* ---- 耗水档位（档位制：每档固定耗水率 + 士气效果） ---- */
  const WATER_TIERS = [
    { id: 'ration',   name: '定量配给', per: 0.15, morale: -3, desc: '只够喝，不洗澡。士气偏低。' },
    { id: 'standard', name: '标准',     per: 0.30, morale:  0, desc: '喝水 + 偶尔擦洗。' },
    { id: 'ample',    name: '宽裕',     per: 0.60, morale:  3, desc: '畅饮 + 每日洗浴。士气上升。' },
    { id: 'luxury',   name: '奢靡',     per: 1.00, morale:  5, desc: '浴池饮品、甲板洒水。士气最高，耗水最凶。' }
  ];

  /* ---- 物品（分层：补给/消费品/水/燃料独立，重稀有分级） ---- */
  const ITEMS = {
    supply:         { name: '补给',       tier: 0 },
    consumer:       { name: '消费品',     tier: 0 },
    water:          { name: '水',         tier: 0 },
    fuel:           { name: '燃料',       tier: 0 },
    material:       { name: '建材',       tier: 1 },
    heavy_machinery:{ name: '重型机械',   tier: 1 },
    luxury:         { name: '奢侈品',     tier: 1 },
    rare_alloy:     { name: '星核合金',   tier: 2 },
    supercond:      { name: '超导结晶',   tier: 2 },
    cold_core:      { name: '冷凝核心',   tier: 2 },
    relic_chip:     { name: '源核芯片',   tier: 3 },
    blueprint:      { name: 'STC 蓝图',   tier: 3 }
  };

  /* ---- 地形特性（修饰共同系统；不套类型） ---- */
  const TERRAIN = {
    shallow:  { name: '浅海',     farm: { food: 0.8, wood: 1.2 }, coral: { wood: 1.1 } },
    calm:     { name: '静海',     farm: { food: 1.5 } },
    reef:     { name: '珊瑚礁',   coral: { wood: 1.4 } },
    volcano:  { name: '火山',     industry: { maintenance: 0.8, input: 0.7, output: 1.4 } },
    deep:     { name: '深海',     drill: { crystal: 0.6 }, farm: { crystal: 0.2, food: 0.3 } },
    solar:    { name: '太阳能带', energy: { power: 1.5 } },
    ice:      { name: '冰海',     drill: { core: 0.5 } },
    reef_shore:{ name: '暗礁滩涂', farm: { food: 0.6 }, coral: { wood: 1.2 } },
    dead_sea: { name: '死寂洋',   danger: 1, fighter: 0.5 },
    wreck:    { name: '残骸带',   salvage: 1.4, danger: 0.4 }
  };

  /* ---- 殖民地特性（修饰共同系统） ---- */
  const TRAITS = {
    volcanic_crater: { name: '火山口',     industry: { maintenance: 0.75, input: 0.7, output: 1.4 } },
    cold_mineral:    { name: '冷凝矿脉',   drill: { core: 0.5 } },
    deep_spring:     { name: '深海热泉',   drill: { crystal: 0.4 }, farm: { food: 0.5 } },
    coral_bank:      { name: '珊瑚温床',   coral: { wood: 1.4 } },
    calm_lagoon:     { name: '静水潟湖',   farm: { food: 1.5 } },
    sun_belt:        { name: '太阳带',     energy: { power: 1.5 } },
    dry_island:      { name: '旱岛',       water: { demand: 1.3 }, farm: { food: 0.4 } },
    ice_shelf:       { name: '永冻冰架',   drill: { core: 0.4 }, water: { supply: 0.5 } }
  };

  /* ---- 样例世界：区域（地形 + 洋流 + 天气 + 殖民地） ---- */
  const REGIONS = [
    { id: 'tide_hollow', name: '潮汐湾',  terrain: 'shallow', current: { dir: 0.6, strength: 1.0 }, weather: 'calm',   colonies: ['marlin_reef', 'tide_hollow_island'] },
    { id: 'ember_ring',  name: '余烬环',  terrain: 'volcano', current: { dir: -1.2, strength: 0.7 }, weather: 'squall', colonies: ['ember_forge', 'cinder_refinery'] },
    { id: 'deep_trench', name: '深海沟',  terrain: 'deep',    current: { dir: 2.4, strength: 1.3 }, weather: 'currents', colonies: ['trench_drilling', 'abyss_farm'] },
    { id: 'frost_rift',  name: '霜裂带',  terrain: 'ice',     current: { dir: 3.0, strength: 0.9 }, weather: 'blizzard', colonies: ['ice_palace', 'cold_mine'] },
    { id: 'drift_solar', name: '漂阳带',  terrain: 'solar',   current: { dir: 0.0, strength: 0.4 }, weather: 'wind',    colonies: ['solar_array', 'solar_ruins'] }
  ];

  /* ---- 殖民地（自由发展：地形 + 特性 + 发展设施） ---- */
  const COLONIES = {
    marlin_reef:       { id: 'marlin_reef',       name: '马林珊瑚礁',   regionId: 'tide_hollow', traits: ['coral_bank'],     develop: { farm: 1, living: 1 } },
    tide_hollow_island:{ id: 'tide_hollow_island',name: '潮汐岛',       regionId: 'tide_hollow', traits: ['calm_lagoon'],    develop: { farm: 2, living: 1 } },
    ember_forge:       { id: 'ember_forge',       name: '熔炉',         regionId: 'ember_ring', traits: ['volcanic_crater'], develop: { industry: 2, living: 1 } },
    cinder_refinery:   { id: 'cinder_refinery',   name: '灰烬精炼厂',   regionId: 'ember_ring', traits: [],                  develop: { industry: 1, mining: 1 } },
    trench_drilling:   { id: 'trench_drilling',   name: '深钻站',       regionId: 'deep_trench',traits: ['cold_mineral'],    develop: { mining: 2, industry: 1 } },
    abyss_farm:        { id: 'abyss_farm',        name: '深渊养殖场',   regionId: 'deep_trench',traits: ['deep_spring'],     develop: { farm: 2 } },
    ice_palace:        { id: 'ice_palace',        name: '冰宫',         regionId: 'frost_rift', traits: ['ice_shelf'],       develop: { industry: 1, living: 1 } },
    cold_mine:         { id: 'cold_mine',         name: '冷凝矿',       regionId: 'frost_rift', traits: ['cold_mineral'],    develop: { mining: 2 } },
    solar_array:       { id: 'solar_array',       name: '太阳能阵列',   regionId: 'drift_solar',traits: ['sun_belt'],        develop: { energy: 2 } },
    solar_ruins:       { id: 'solar_ruins',       name: '废弃阵列',     regionId: 'drift_solar',traits: [],                  develop: { salvage: 1 }, ruin: 0.5 }
  };

  /* ---- 最小四方势力 ---- */
  const FACTIONS = {
    official: { name: '艾瑟瑞亚督府', color: '#5ad1ff', fleets: ['army', 'customs', 'mining', 'fishing', 'merchant'] },
    corp:     { name: '星穹重工',     color: '#e8b45a', fleets: ['army', 'mining', 'industrial', 'merchant'] },
    pirate:   { name: '海盗',         color: '#ff5f6d', fleets: ['raider', 'blackmarket'], disguise: true },
    free:     { name: '自由联盟',     color: '#9fe8b8', fleets: ['mining', 'patrol', 'fishing', 'merchant', 'blackmarket'] }
  };

  /* ---- 舰队模板（船种组合 + AI 意图 + 货物） ---- */
  const FLEET_TEMPLATES = {
    merchant:  { name: '商队',       intent: 'trade',   ships: ['destroyer', 'lightCruiser'],  cargo: ['supply', 'consumer', 'luxury'], speed: 0.9 },
    mining:    { name: '采矿队',     intent: 'mine',    ships: ['destroyer'],                  cargo: ['material'],   speed: 0.7 },
    fishing:   { name: '捕捞队',     intent: 'fish',    ships: ['destroyer'],                  cargo: ['supply'],     speed: 0.7 },
    army:      { name: '军队',       intent: 'patrol',  ships: ['lightCruiser', 'heavyCruiser'], cargo: [],          speed: 1.0 },
    customs:   { name: '海关稽查队', intent: 'inspect', ships: ['destroyer'],                  cargo: [],            speed: 1.0 },
    patrol:    { name: '巡逻队',     intent: 'patrol',  ships: ['destroyer'],                  cargo: [],            speed: 1.0 },
    industrial:{ name: '工业船团',   intent: 'trade',   ships: ['heavyCruiser', 'destroyer'],  cargo: ['heavy_machinery', 'material'], speed: 0.8 },
    raider:    { name: '劫掠队',     intent: 'raid',    ships: ['destroyer', 'hammer'],        cargo: [],            speed: 1.1 },
    blackmarket:{ name: '黑市商队',  intent: 'smuggle', ships: ['destroyer'],                  cargo: ['consumer', 'luxury'], speed: 1.0, disguise: true }
  };

  /* ---- 玩家初始 ---- */
  const STARTS = {
    regionId: 'tide_hollow',
    fleet: { pos: { x: 0.30, y: 0.55 }, fuel: 60, supply: 55, water: 80, waterTier: 'standard', morale: 70 }
  };

  globalThis.WorldData = { WATER_TIERS, ITEMS, TERRAIN, TRAITS, REGIONS, COLONIES, FACTIONS, FLEET_TEMPLATES, STARTS };
})();
