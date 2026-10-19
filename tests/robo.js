// "Jogador robô": chama "Marco", escuta de onde vem cada "Polo!", anda até lá e estica a mão.
// Para o Papagaio, desfaz o truque (o Polo está do lado oposto de onde a voz veio).
// Usado nos testes e no navegador (tecla F8) para ver uma solução.
import { espelho } from '../js/sala.js';

export function criaRobo(rodada, { vel = 0.8, cabeca = [0, 1.6, 0] } = {}) {
  const ouvidos = new Map();        // id → posição estimada
  let espera = 0.5, alvo = null, chegou = 0;
  const cab = cabeca;
  const tipoChamada = rodada.fase.polos.some(g => g.tipo === 'timido') ? 'sussurro' : 'fala';
  return {
    cabeca: cab,
    // um passo do robô: trata os eventos da rodada e devolve as mãos
    passo(dt) {
      for (const e of rodada.eventos) {
        if (e.tipo === 'polo' || e.tipo === 'risadinha') {
          const p = rodada.polos[e.id];
          ouvidos.set(e.id, p.tipo === 'papagaio' && e.tipo === 'polo' ? espelho(e.de, cab) : e.de);
        }
        if (e.tipo === 'pego' || e.tipo === 'apagou') { ouvidos.delete(e.id); if (alvo === e.id) alvo = null; }
      }
      if (alvo === null || !ouvidos.has(alvo)) {
        alvo = null;
        let dm = Infinity;
        for (const [id, p] of ouvidos) { const d = Math.hypot(p[0] - cab[0], p[2] - cab[2]); if (d < dm) { dm = d; alvo = id; } }
      }
      espera -= dt;
      if (alvo === null) {
        if (espera <= 0) { rodada.chama(tipoChamada, cab); espera = 2.5; }
        return [];
      }
      const p = ouvidos.get(alvo);
      const dx = p[0] - cab[0], dz = p[2] - cab[2], d = Math.hypot(dx, dz);
      if (d > 0.35) {
        const k = Math.min(1, vel * dt / d);
        cab[0] += dx * k; cab[2] += dz * k;
        chegou = 0;
        return [];
      }
      // chegou: estica a mão; se não pegou em 0,6 s o Polo andou: esquece e chama de novo
      chegou += dt;
      if (chegou > 0.6) {
        ouvidos.delete(alvo); alvo = null; chegou = 0;
        if (espera <= 0) { rodada.chama(tipoChamada, cab); espera = 2.5; }
      }
      return [p.slice()];
    },
  };
}
