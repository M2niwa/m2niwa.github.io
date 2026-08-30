/* ============================================================
   简易合成音效（WebAudio，无需外部资源）
   ============================================================ */
(function () {
  'use strict';

  const AudioFx = {
    enabled: true,
    ctx: null,
    master: null,
    noiseBuf: null,

    init: function () {
      if (this.ctx) return;
      if (typeof window === 'undefined') return; // Node 环境无音频
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
        // 预生成噪声缓冲
        const len = this.ctx.sampleRate * 1.5;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { /* 静默失败 */ }
    },

    setEnabled: function (on) {
      this.enabled = !!on;
      if (this.master) this.master.gain.value = on ? 0.35 : 0;
    },

    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    _t: function () { return this.ctx ? this.ctx.currentTime : 0; },

    /** 通用包络 */
    _env: function (gain, t0, a, peak, dur) {
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + a);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    },

    /** 低频轰鸣 + 噪声（火炮/爆炸） */
    boom: function (freq, dur, vol, lp) {
      if (!this.enabled || !this.ctx) return;
      const t = this._t();
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.25), t + dur);
      const og = this.ctx.createGain();
      this._env(og, t, 0.004, vol, dur);
      osc.connect(og).connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.05);

      const ns = this.ctx.createBufferSource();
      ns.buffer = this.noiseBuf;
      const nf = this.ctx.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.value = lp || 900;
      const ng = this.ctx.createGain();
      this._env(ng, t, 0.004, vol * 0.8, dur * 0.7);
      ns.connect(nf).connect(ng).connect(this.master);
      ns.start(t); ns.stop(t + dur + 0.05);
    },

    /** 开炮（短促响亮） */
    cannon: function (size) {
      const s = size || 1;
      this.boom(90 + 40 * s, 0.16 + 0.1 * s, 0.5 * s, 1400 + 600 * s);
    },

    /** 爆炸（低音 + 噪声） */
    explosion: function (size) {
      const s = size || 1;
      this.boom(55, 0.7 * s, 0.9 * s, 500);
      if (this.ctx) {
        const t = this._t();
        const ns = this.ctx.createBufferSource();
        ns.buffer = this.noiseBuf;
        const nf = this.ctx.createBiquadFilter();
        nf.type = 'highpass'; nf.frequency.value = 800;
        const ng = this.ctx.createGain();
        this._env(ng, t, 0.01, 0.5 * s, 0.45 * s);
        ns.connect(nf).connect(ng).connect(this.master);
        ns.start(t); ns.stop(t + 0.5);
      }
    },

    /** 命中水花/船体 */
    splash: function (vol) {
      if (!this.enabled || !this.ctx) return;
      const t = this._t();
      const ns = this.ctx.createBufferSource();
      ns.buffer = this.noiseBuf;
      const nf = this.ctx.createBiquadFilter();
      nf.type = 'bandpass'; nf.frequency.value = 1600; nf.Q.value = 1.2;
      const ng = this.ctx.createGain();
      this._env(ng, t, 0.003, vol || 0.3, 0.12);
      ns.connect(nf).connect(ng).connect(this.master);
      ns.start(t); ns.stop(t + 0.15);
    },

    /** 鱼雷/导弹发射 */
    launch: function () {
      if (!this.enabled || !this.ctx) return;
      const t = this._t();
      const ns = this.ctx.createBufferSource();
      ns.buffer = this.noiseBuf;
      const nf = this.ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.setValueAtTime(300, t);
      nf.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
      nf.Q.value = 2;
      const ng = this.ctx.createGain();
      this._env(ng, t, 0.02, 0.5, 0.55);
      ns.connect(nf).connect(ng).connect(this.master);
      ns.start(t); ns.stop(t + 0.6);
    },

    /** 光束滋滋声 */
    zap: function () {
      if (!this.enabled || !this.ctx) return;
      const t = this._t();
      const ns = this.ctx.createBufferSource();
      ns.buffer = this.noiseBuf;
      const nf = this.ctx.createBiquadFilter();
      nf.type = 'highpass'; nf.frequency.value = 2500;
      const ng = this.ctx.createGain();
      this._env(ng, t, 0.002, 0.14, 0.08);
      ns.connect(nf).connect(ng).connect(this.master);
      ns.start(t); ns.stop(t + 0.1);
    },

    /** 鱼雷警报 */
    alarm: function () {
      if (!this.enabled || !this.ctx) return;
      const t = this._t();
      for (let i = 0; i < 3; i++) {
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 660;
        const og = this.ctx.createGain();
        const t0 = t + i * 0.22;
        this._env(og, t0, 0.005, 0.16, 0.14);
        osc.connect(og).connect(this.master);
        osc.start(t0); osc.stop(t0 + 0.16);
      }
    },

    /** 引擎/转向水声 */
    whoosh: function () {
      if (!this.enabled || !this.ctx) return;
      const t = this._t();
      const ns = this.ctx.createBufferSource();
      ns.buffer = this.noiseBuf;
      const nf = this.ctx.createBiquadFilter();
      nf.type = 'lowpass'; nf.frequency.value = 500;
      const ng = this.ctx.createGain();
      this._env(ng, t, 0.05, 0.12, 0.4);
      ns.connect(nf).connect(ng).connect(this.master);
      ns.start(t); ns.stop(t + 0.45);
    }
  };

  globalThis.AudioFx = AudioFx;
})();
