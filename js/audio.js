// Sons sintetizados na hora: a voz "Po-lo!" de cada Polo (vogais por formantes), risadinhas,
// pegar, eco que some, batimento de "quente ou frio" e o aviso de parede. Tudo em áudio 3D (HRTF):
// o som sai do lugar certo da sala. Sem música de fundo: é um jogo de ouvir.
// Sem som até unlock() ser chamado num clique (testes automáticos ficam mudos).

const formantes = {
  o: [[450, 1, 90], [800, 0.6, 110], [2830, 0.12, 170]],
  l: [[360, 1, 80], [1000, 0.25, 120], [2700, 0.08, 170]],
  i: [[300, 1, 70], [2300, 0.5, 140], [3000, 0.3, 200]],
  a: [[750, 1, 100], [1200, 0.7, 120], [2600, 0.15, 170]],
};
const ganho = (f, vogal) => formantes[vogal].reduce((s, [fc, g, bw]) => s + g * Math.exp(-((f - fc) ** 2) / (2 * bw * bw)), 0.02);

export class Sons {
  constructor() { this.ctx = null; this.vozes = new Map(); this.volume = 1; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.mestre = this.ctx.createGain();
      this.mestre.gain.value = this.volume;
      this.mestre.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Sílabas: lista de { vogal, ini, fim, f0a, f0b, consoante }
  sintetiza(silabas, dur, { ruido = 0 } = {}) {
    if (!this.ctx) return null;
    const c = this.ctx, taxa = c.sampleRate, n = Math.ceil(dur * taxa);
    const buf = c.createBuffer(1, n, taxa), d = buf.getChannelData(0);
    for (const s of silabas) {
      const i0 = Math.floor(s.ini * taxa), i1 = Math.min(n, Math.floor(s.fim * taxa));
      let fase = 0;
      const len = i1 - i0;
      for (let i = i0; i < i1; i++) {
        const u = (i - i0) / len;
        const f0 = s.f0a + (s.f0b - s.f0a) * u;
        fase += f0 / taxa;
        let v = 0;
        const vogal = s.consoante && u < 0.25 ? s.consoante : s.vogal;
        for (let k = 1; k * f0 < 4500; k++) v += Math.sin(2 * Math.PI * k * fase) * ganho(k * f0, vogal) / k;
        const env = Math.min(1, u / 0.06) * Math.min(1, (1 - u) / 0.25);
        d[i] += v * env * 0.35;
      }
      if (s.plosiva) for (let i = 0; i < taxa * 0.012; i++) d[i0 + i] += (Math.random() * 2 - 1) * 0.25 * (1 - i / (taxa * 0.012));
    }
    if (ruido) for (let i = 0; i < n; i++) d[i] += (Math.random() * 2 - 1) * ruido * Math.min(1, (n - i) / (taxa * 0.05));
    return buf;
  }

  vozPolo(f0) {
    const k = 'polo' + f0;
    if (!this.ctx) return null;
    if (!this.vozes.has(k)) this.vozes.set(k, this.sintetiza([
      { vogal: 'o', ini: 0, fim: 0.22, f0a: f0 * 0.95, f0b: f0, plosiva: true },
      { vogal: 'o', consoante: 'l', ini: 0.24, fim: 0.58, f0a: f0 * 1.12, f0b: f0 * 0.9 },
    ], 0.62));
    return this.vozes.get(k);
  }
  risada(f0) {
    const k = 'ri' + f0;
    if (!this.ctx) return null;
    if (!this.vozes.has(k)) this.vozes.set(k, this.sintetiza([0, 1, 2].map(i => ({ vogal: 'i', ini: i * 0.13, fim: i * 0.13 + 0.09, f0a: f0 * 1.4, f0b: f0 * 1.25 })), 0.45, { ruido: 0.02 }));
    return this.vozes.get(k);
  }
  vozMarco() {
    if (!this.ctx) return null;
    if (!this.vozes.has('marco')) this.vozes.set('marco', this.sintetiza([
      { vogal: 'a', ini: 0, fim: 0.25, f0a: 180, f0b: 200 },
      { vogal: 'o', ini: 0.27, fim: 0.55, f0a: 220, f0b: 170, plosiva: true },
    ], 0.6));
    return this.vozes.get('marco');
  }

  // Toca um buffer na posição (x, y, z) da sala, ou sem posição (perto da cabeça).
  toca(buf, pos = null, vol = 1, taxaVel = 1) {
    if (!this.ctx || !buf) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = taxaVel;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(g);
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 0.7;
      p.rolloffFactor = 1.1;
      p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2];
      g.connect(p); p.connect(this.mestre);
    } else g.connect(this.mestre);
    src.start();
  }

  tom(freq, dur, { tipo = 'sine', vol = 0.2, pos = null, desliza = 1, atraso = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + atraso;
    const o = c.createOscillator(), g = c.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t);
    if (desliza !== 1) o.frequency.exponentialRampToValueAtTime(freq * desliza, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'HRTF'; p.refDistance = 0.5;
      p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2];
      g.connect(p); p.connect(this.mestre);
    } else g.connect(this.mestre);
    o.start(t); o.stop(t + dur + 0.02);
  }

  ruido(dur, { vol = 0.15, pos = null, corte = 2000 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, n = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    let lp = 0;
    const a = Math.min(1, corte * 2 * Math.PI / c.sampleRate);
    for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * a; d[i] = lp * (1 - i / n) * 3; }
    this.toca(buf, pos, vol);
  }

  // Ouvido do jogador: posição e orientação da cabeça (para o áudio 3D).
  ouvinte(pos, frente, cima) {
    if (!this.ctx) return;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos[0], t); l.positionY.setValueAtTime(pos[1], t); l.positionZ.setValueAtTime(pos[2], t);
      l.forwardX.setValueAtTime(frente[0], t); l.forwardY.setValueAtTime(frente[1], t); l.forwardZ.setValueAtTime(frente[2], t);
      l.upX.setValueAtTime(cima[0], t); l.upY.setValueAtTime(cima[1], t); l.upZ.setValueAtTime(cima[2], t);
    } else {
      l.setPosition(...pos);
      l.setOrientation(...frente, ...cima);
    }
  }

  // Efeitos do jogo
  polo(f0, pos, grande = false) { this.toca(this.vozPolo(f0), pos, grande ? 1.3 : 1, grande ? 0.75 : 1); }
  risadinha(f0, pos) { this.toca(this.risada(f0), pos, 0.45); }
  marco() { this.toca(this.vozMarco(), null, 0.5); }
  pego(pos) { [1046, 1318, 1568, 2093].forEach((f, i) => this.tom(f, 0.3, { tipo: 'triangle', vol: 0.18, pos, atraso: i * 0.07 })); }
  apagou(pos) { this.ruido(0.4, { vol: 0.25, pos, corte: 1500 }); }
  divide(pos) { [0, 0.12, 0.24].forEach(a => this.tom(500, 0.15, { tipo: 'square', vol: 0.12, pos, desliza: 2, atraso: a })); }
  foge(pos) { this.ruido(0.5, { vol: 0.12, pos, corte: 3000 }); }
  coracao(pos, vol) { this.tom(70, 0.12, { vol: 0.5 * vol, pos }); this.tom(60, 0.12, { vol: 0.35 * vol, pos, atraso: 0.16 }); }
  parede() { this.tom(220, 0.15, { tipo: 'square', vol: 0.07 }); }
  espiar() { this.tom(880, 0.2, { vol: 0.12, desliza: 1.5 }); }
  clique() { this.tom(1100, 0.05, { tipo: 'square', vol: 0.06 }); }
  ouviu(tipo) { this.tom(tipo === 'grito' ? 520 : tipo === 'sussurro' ? 260 : 390, 0.08, { vol: 0.05 }); }
  vitoria() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tom(f, 0.4, { tipo: 'triangle', vol: 0.18, atraso: i * 0.12 })); }
}
