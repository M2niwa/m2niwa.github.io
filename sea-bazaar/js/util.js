/* ============================================================
   通用工具函数
   ============================================================ */
(function () {
  'use strict';

  const U = {};
  U.TAU = Math.PI * 2;

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.rand = function (a, b) { return a + Math.random() * (b - a); };
  U.randInt = function (a, b) { return Math.floor(U.rand(a, b + 1)); };
  U.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  /** 近似正态分布随机数（0 均值，sigma 标准差） */
  U.gauss = function (sigma) { return (Math.random() + Math.random() + Math.random() - 1.5) * sigma; };

  /** 归一化角度到 [-PI, PI] */
  U.normAngle = function (a) {
    while (a > Math.PI) a -= U.TAU;
    while (a < -Math.PI) a += U.TAU;
    return a;
  };
  U.angleDiff = function (a, b) { return U.normAngle(a - b); };
  U.dist = function (x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); };
  U.dist2 = function (x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };

  /** heading -> 单位方向向量（heading 0 = 上方, PI/2 = 右方） */
  U.dirOf = function (h) { return { x: Math.sin(h), y: -Math.cos(h) }; };
  /** 方向向量 -> heading 角度 */
  U.angleOf = function (x, y) { return Math.atan2(x, -y); };
  /** 从 heading 方向到 (dx,dy) 的带符号相对角度 */
  U.relAngle = function (h, dx, dy) { return U.normAngle(U.angleOf(dx, dy) - h); };

  /** 点到线段距离 */
  U.distToSeg = function (px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return U.dist(px, py, x1, y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = U.clamp(t, 0, 1);
    return U.dist(px, py, x1 + dx * t, y1 + dy * t);
  };

  /** 两圆碰撞 */
  U.circleHit = function (x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1, dy = y2 - y1, r = r1 + r2;
    return dx * dx + dy * dy <= r * r;
  };

  U.fmt = function (n) { return Math.round(n).toString(); };
  U.fmt1 = function (n) { return (Math.round(n * 10) / 10).toString(); };

  globalThis.Util = U;
})();
