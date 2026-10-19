// Uma rodada de Marco Polo: os Polos, as respostas ao "Marco!", pegar com a mão, espiar e
// estrelas. Sem navegador: o main.js passa a cabeça e as mãos; os testes passam um robô.
import { livre, pontoAoAcaso, espelho, rng } from './sala.js';

export const PEGA = 0.16;          // distância da mão para pegar (m)
export const ESPIADAS = 3;
export const TEMPO_ESPIA = 1.2;

export const FASES = [
  { nome: 'Primeiro Polo', dica: 'Grite "Marco!" e ouça de onde vem o "Polo!". Vá até lá e pegue com a mão.', polos: [{ tipo: 'parado', n: 1 }], par: 4 },
  { nome: 'Andarilhos', dica: 'Três Polos passeando pela sala. Eles não param quietos!', polos: [{ tipo: 'andarilho', n: 3 }], par: 10 },
  { nome: 'O Tímido', dica: 'O Tímido só responde se você SUSSURRAR "Marco". Se gritar, ele foge.', polos: [{ tipo: 'timido', n: 2 }], par: 8 },
  { nome: 'O Papagaio', dica: 'O Papagaio joga a voz para o lado oposto de você: ouviu atrás, ele está na frente.', polos: [{ tipo: 'papagaio', n: 2 }], par: 8 },
  { nome: 'Os Escondidos', dica: 'Eles moram debaixo da mesa, atrás do sofá e nos cantos. Abaixe-se!', polos: [{ tipo: 'parado', n: 3, onde: 'baixo' }], par: 8 },
  { nome: 'O Ligeiro', dica: 'O Ligeiro corre quando ouve "Marco". Chame, escute para onde ele foi e dê o bote.', polos: [{ tipo: 'ligeiro', n: 2 }], par: 10 },
  { nome: 'O Ventríloquo', dica: 'Cada voz responde de dois lugares: um é o Polo, o outro é só eco e some se você tocar.', polos: [{ tipo: 'parado', n: 2, gemeo: true }], par: 10 },
  { nome: 'Mestre Polo-Rei', dica: 'O Polo-Rei é grande. Pegue ele e ele se divide em três filhotes ligeiros!', polos: [{ tipo: 'rei', n: 1 }], par: 12 },
];

const VEL = { parado: 0, andarilho: 0.12, timido: 0.05, papagaio: 0.06, ligeiro: 0.08, falso: 0, rei: 0.07, filhote: 0.22 };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const distChao = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export class Rodada {
  constructor(fase, sala, { seed = 1, jogador = [0, 1.6, 0] } = {}) {
    this.fase = fase;
    this.sala = sala;
    this.rnd = rng(seed);
    this.t = 0;
    this.chamadas = 0;
    this.espiadas = 0;
    this.espiando = 0;
    this.estado = 'jogo';
    this.eventos = [];
    this.pendentes = [];       // respostas agendadas
    this.ultimaChamada = 0;
    this.polos = [];
    let id = 0, voz = 0;
    const vozes = [520, 640, 760, 460, 580, 700, 820];
    for (const g of fase.polos) {
      for (let i = 0; i < g.n; i++) {
        const v = vozes[voz++ % vozes.length];
        const p = this.lugar(g.onde, jogador);
        this.polos.push(this.novoPolo(id++, g.tipo, p, v));
        if (g.gemeo) this.polos.push(this.novoPolo(id++, 'falso', this.lugar(g.onde, jogador, p), v));
      }
    }
  }

  novoPolo(id, tipo, p, voz) {
    return { id, tipo, pos: p.slice(), alvo: null, estado: 'livre', voz, fuga: 0, fugaDe: null, tamanho: tipo === 'rei' ? 1.8 : tipo === 'filhote' ? 0.7 : 1 };
  }

  // Lugar inicial: longe do jogador (e do gêmeo); 'baixo' usa os esconderijos de baixo.
  lugar(onde, jogador, longeDe = null) {
    const ok = (p) => distChao(p, jogador) > 1.0 && (!longeDe || dist(p, longeDe) > 1.0);
    if (onde === 'baixo') {
      const opcoes = this.sala.esconderijos.filter(e => e.baixo && ok(e.p) && !this.polos?.some(q => dist(q.pos, e.p) < 0.3));
      if (opcoes.length) return opcoes[Math.floor(this.rnd() * opcoes.length)].p.slice();
    }
    for (let i = 0; i < 50; i++) {
      const p = pontoAoAcaso(this.sala, this.rnd, { evita: jogador, longe: 1.0 });
      if (ok(p)) return p;
    }
    return pontoAoAcaso(this.sala, this.rnd);
  }

  get livres() { return this.polos.filter(p => p.estado === 'livre'); }
  get reais() { return this.polos.filter(p => p.tipo !== 'falso'); }
  get pegos() { return this.polos.filter(p => p.estado === 'pego').length; }
  get total() { return this.reais.length; }

  // O jogador chamou "Marco!" (tipo: 'grito' | 'fala' | 'sussurro').
  chama(tipo, jogador) {
    if (this.estado !== 'jogo') return;
    this.chamadas++;
    this.ultimaChamada = this.t;
    let atraso = 0.35;
    for (const p of this.livres) {
      const perto = dist(p.pos, jogador) < 1.6;
      let responde;
      if (p.tipo === 'timido') {
        responde = tipo === 'sussurro';
        if (tipo === 'grito') this.foge(p, jogador, 2.5, 0.6);
      } else responde = tipo !== 'sussurro' || perto;
      if (!responde) continue;
      // o Ligeiro e os filhotes correm primeiro e só respondem quando param
      const corre = p.tipo === 'ligeiro' || p.tipo === 'filhote';
      if (corre) this.foge(p, jogador, 1.6, 0.75);
      this.pendentes.push({ id: p.id, t: this.t + atraso + this.rnd() * 0.25 + (corre ? 1.7 : 0) });
      atraso += 0.35;
    }
  }

  foge(p, de, seg, vel) {
    p.fuga = seg; p.velFuga = vel; p.fugaDe = de.slice();
    p.alvo = pontoAoAcaso(this.sala, this.rnd, { evita: de, longe: 1.4, y: p.tipo === 'timido' ? p.pos[1] : null });
    this.eventos.push({ tipo: 'foge', id: p.id });
  }

  espia() {
    if (this.estado !== 'jogo' || this.espiando > 0 || this.espiadas >= ESPIADAS) return false;
    this.espiadas++;
    this.espiando = TEMPO_ESPIA;
    return true;
  }

  // Um passo. cabeca: [x,y,z]; maos: lista de pontos [x,y,z] (pontas dos dedos, palma ou controle).
  passo(dt, cabeca, maos) {
    this.eventos.length = 0;
    if (this.estado !== 'jogo') return;
    this.t += dt;
    if (this.espiando > 0) this.espiando -= dt;

    // respostas "Polo!"
    for (let i = this.pendentes.length - 1; i >= 0; i--) {
      const r = this.pendentes[i];
      if (this.t < r.t) continue;
      this.pendentes.splice(i, 1);
      const p = this.polos[r.id];
      if (!p || p.estado !== 'livre') continue;
      const de = p.tipo === 'papagaio' ? espelho(p.pos, cabeca) : p.pos.slice();
      this.eventos.push({ tipo: 'polo', id: p.id, de, voz: p.voz, tamanho: p.tamanho });
    }

    // risadinha de dica se ficar muito tempo sem chamar
    if (this.t - this.ultimaChamada > 14) {
      this.ultimaChamada = this.t;
      const l = this.livres.filter(p => p.tipo !== 'falso');
      if (l.length) { const p = l[Math.floor(this.rnd() * l.length)]; this.eventos.push({ tipo: 'risadinha', id: p.id, de: p.pos.slice(), voz: p.voz }); }
    }

    for (const p of this.polos) {
      if (p.estado !== 'livre') continue;
      this.anda(p, dt);
      for (const m of maos) {
        if (dist(m, p.pos) > PEGA * p.tamanho) continue;
        if (p.tipo === 'falso') { p.estado = 'apagado'; this.eventos.push({ tipo: 'apagou', id: p.id, de: p.pos.slice() }); break; }
        p.estado = 'pego';
        this.eventos.push({ tipo: 'pego', id: p.id, de: p.pos.slice(), voz: p.voz });
        if (p.tipo === 'rei') this.divide(p);
        break;
      }
    }

    if (this.pegos === this.total) {
      this.estado = 'fim';
      for (const p of this.polos) if (p.estado === 'livre') p.estado = 'apagado';
      this.eventos.push({ tipo: 'fim', estrelas: this.estrelas });
    }
  }

  divide(rei) {
    const vozes = [900, 980, 1060];
    for (let i = 0; i < 3; i++) {
      let p = null;
      for (let k = 0; k < 40 && !p; k++) {
        const a = this.rnd() * Math.PI * 2;
        const q = [rei.pos[0] + Math.cos(a) * 0.6, Math.max(0.3, Math.min(1.6, rei.pos[1])), rei.pos[2] + Math.sin(a) * 0.6];
        if (livre(this.sala, q, 0.25)) p = q;
      }
      p = p || pontoAoAcaso(this.sala, this.rnd);
      this.polos.push(this.novoPolo(this.polos.length, 'filhote', p, vozes[i]));
    }
    this.eventos.push({ tipo: 'divide', id: rei.id, de: rei.pos.slice() });
  }

  anda(p, dt) {
    let vel = VEL[p.tipo] || 0;
    if (p.fuga > 0) { p.fuga -= dt; vel = p.velFuga; }
    if (vel <= 0) return;
    if (!p.alvo || dist(p.pos, p.alvo) < 0.05) {
      p.alvo = pontoAoAcaso(this.sala, this.rnd);
    }
    const d = dist(p.pos, p.alvo);
    const k = Math.min(1, vel * dt / Math.max(d, 1e-6));
    const nova = [p.pos[0] + (p.alvo[0] - p.pos[0]) * k, p.pos[1] + (p.alvo[1] - p.pos[1]) * k, p.pos[2] + (p.alvo[2] - p.pos[2]) * k];
    if (livre(this.sala, nova, 0.15)) p.pos = nova;
    else p.alvo = null;
  }

  // Distância da mão até o Polo livre mais perto (para a vibração "quente ou frio").
  maisPerto(m) {
    let d = Infinity;
    for (const p of this.polos) if (p.estado === 'livre') d = Math.min(d, dist(m, p.pos));
    return d;
  }

  get estrelas() {
    return 1 + (this.chamadas <= this.fase.par ? 1 : 0) + (this.espiadas === 0 ? 1 : 0);
  }
}
