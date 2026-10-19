// Testes automáticos: node tests/run.js  (sem som: nada aqui toca áudio)
import { salaPadrao, salaDosPlanos, livre, dentroPoligono, espelho, paredeMaisPerto, rng } from '../js/sala.js';
import { DetectorVoz } from '../js/voz.js';
import { Rodada, FASES } from '../js/jogo.js';
import { criaRobo } from './robo.js';

let falhas = 0, total = 0;
function ok(c, msg) { total++; if (!c) { falhas++; console.log('  FALHOU:', msg); } }

const PLANOS_QUEST = [
  { rotulo: 'floor', orientacao: 'horizontal', pontos: [[-2.2, 0, 1], [2, 0, 1], [2, 0, -3], [-2.2, 0, -3]] },
  { rotulo: 'couch', orientacao: 'horizontal', pontos: [[1, 0.45, -2.9], [1.9, 0.45, -2.9], [1.9, 0.45, -1.2], [1, 0.45, -1.2]] },
  { rotulo: 'table', orientacao: 'horizontal', pontos: [[-1.5, 0.7, -2], [-0.7, 0.7, -2], [-0.7, 0.7, -1.2], [-1.5, 0.7, -1.2]] },
  { rotulo: 'ceiling', orientacao: 'horizontal', pontos: [[-2.2, 2.5, 1], [2, 2.5, 1], [2, 2.5, -3], [-2.2, 2.5, -3]] },
];

console.log('Sala');
{
  const s = salaPadrao();
  ok(s.paredes.length === 4 && s.moveis.length === 2, 'sala padrão tem 4 paredes e 2 móveis');
  ok(dentroPoligono(s.chao, 0, -1) && !dentroPoligono(s.chao, 0, 2), 'dentro/fora do chão');
  ok(s.paredes.every(w => dentroPoligono(s.chao, (w.a[0] + w.b[0]) / 2 + w.n[0] * 0.2, (w.a[1] + w.b[1]) / 2 + w.n[1] * 0.2)), 'normais das paredes apontam para dentro');
  ok(livre(s, [0.75, 0.22, -1.55]) && !livre(s, [0.75, 0.74, -1.55]), 'debaixo da mesa é livre, dentro do tampo não');
  ok(!livre(s, [-1.0, 0.3, -1.7]), 'dentro do sofá não é livre');
  ok(s.esconderijos.some(e => e.nome === 'debaixo da mesa') && s.esconderijos.length >= 6, `esconderijos (${s.esconderijos.length})`);
  ok(Math.abs(paredeMaisPerto(s, 1.2, -1).d - 0.3) < 1e-6, 'distância até a parede');
  const e = espelho([1, 1, -2], [0, 1.6, 0]);
  ok(e[0] === -1 && e[2] === 2, 'papagaio: voz do lado oposto do jogador');
  const q = salaDosPlanos(PLANOS_QUEST);
  ok(q && q.paredes.length === 4 && q.moveis.length === 2 && q.moveis.some(m => m.tipo === 'mesa') && q.moveis.some(m => m.tipo === 'sofa'), 'sala do Quest: chão, paredes, mesa e sofá (teto ignorado)');
  ok(salaDosPlanos([{ rotulo: 'floor', orientacao: 'horizontal', pontos: [[0, 0, 0], [0.5, 0, 0], [0.5, 0, 0.5]] }]) === null, 'chão pequeno demais: usa a sala padrão');
}

console.log('Voz');
{
  const taxa = 48000, bloco = 1024;
  const r = rng(5);
  function ouve(fazSom, dur) {
    const d = new DetectorVoz({ taxa });
    const res = [];
    const n = Math.floor(taxa * (1.5 + dur + 0.8) / bloco);
    for (let b = 0; b < n; b++) {
      const a = new Float32Array(bloco);
      for (let i = 0; i < bloco; i++) {
        const t = (b * bloco + i) / taxa;
        a[i] = (r() * 2 - 1) * 0.001 + (t > 1.5 && t < 1.5 + dur ? fazSom(t) : 0);
      }
      const x = d.processa(a);
      if (x) res.push(x);
    }
    return res;
  }
  const vozAlta = (t) => 0.5 * (Math.sin(2 * Math.PI * 220 * t) + 0.5 * Math.sin(2 * Math.PI * 440 * t) + 0.3 * Math.sin(2 * Math.PI * 660 * t)) / 1.8;
  const vozNormal = (t) => vozAlta(t) * 0.08;
  const chiado = () => (r() * 2 - 1) * 0.02;
  const fmt = (x) => JSON.stringify(x.map(v => [v.tipo, +v.pico.toFixed(1), +v.acima.toFixed(1), +v.aspero.toFixed(2)]));
  let x = ouve(vozAlta, 0.6);
  ok(x.length === 1 && x[0].tipo === 'grito', `grito reconhecido ${fmt(x)}`);
  x = ouve(vozNormal, 0.6);
  ok(x.length === 1 && x[0].tipo === 'fala', `fala reconhecida ${fmt(x)}`);
  x = ouve(chiado, 0.7);
  ok(x.length === 1 && x[0].tipo === 'sussurro', `sussurro reconhecido ${fmt(x)}`);
  x = ouve(() => 0, 0.5);
  ok(x.length === 0, 'silêncio não vira "Marco"');
  x = ouve(vozAlta, 0.04);
  ok(x.length === 0, 'estalo curto não vira "Marco"');
  const d = new DetectorVoz({ taxa });
  d.tapaOuvidos(5);
  const alto = new Float32Array(bloco).map((_, i) => vozAlta(i / taxa));
  let algum = false;
  for (let i = 0; i < 100; i++) if (d.processa(alto)) algum = true;
  ok(!algum, 'enquanto os Polos falam o microfone é ignorado');
}

console.log('Polos');
{
  const s = salaPadrao();
  const rd = new Rodada(FASES[1], s, { seed: 3 });
  let fora = false;
  for (let i = 0; i < 60 * 30; i++) {
    if (i % 90 === 0) rd.chama('grito', [0, 1.6, 0]);
    rd.passo(1 / 30, [0, 1.6, 0], []);
    for (const p of rd.polos) if (!livre(s, p.pos, 0.1)) fora = true;
  }
  ok(!fora, 'Polos andando ficam dentro da sala, fora dos móveis e ao alcance');
  ok(rd.polos.every(p => Math.hypot(p.pos[0], p.pos[2]) > 0.5), 'Polos começam longe do jogador');
  // Tímido: grito faz fugir e não responde; sussurro responde
  const t = new Rodada(FASES[2], s, { seed: 4 });
  t.chama('grito', [0, 1.6, 0]);
  let resp = 0, fugiu = false;
  for (let i = 0; i < 90; i++) { t.passo(1 / 30, [0, 1.6, 0], []); for (const e of t.eventos) if (e.tipo === 'polo') resp++; if (t.polos.some(p => p.fuga > 0)) fugiu = true; }
  ok(resp === 0 && fugiu, 'Tímido não responde ao grito e foge');
  t.chama('sussurro', [0, 1.6, 0]);
  for (let i = 0; i < 90; i++) { t.passo(1 / 30, [0, 1.6, 0], []); for (const e of t.eventos) if (e.tipo === 'polo') resp++; }
  ok(resp === 2, `Tímido responde ao sussurro (${resp})`);
  // Papagaio: voz do lado oposto
  const pg = new Rodada(FASES[3], s, { seed: 6 });
  pg.chama('fala', [0, 1.6, 0]);
  let certo = true, n = 0;
  for (let i = 0; i < 90; i++) {
    pg.passo(1 / 30, [0, 1.6, 0], []);
    for (const e of pg.eventos) if (e.tipo === 'polo') { n++; const p = pg.polos[e.id].pos; if (Math.abs(e.de[0] + p[0]) > 0.05 || Math.abs(e.de[2] + p[2]) > 0.05) certo = false; }
  }
  ok(n === 2 && certo, 'Papagaio responde do lado oposto do jogador');
  // Ligeiro: corre e só responde depois
  const lg = new Rodada(FASES[5], s, { seed: 9 });
  const antes = lg.polos.map(p => p.pos.slice());
  lg.chama('fala', [0, 1.6, 0]);
  let primeira = null;
  for (let i = 0; i < 120 && primeira === null; i++) { lg.passo(1 / 30, [0, 1.6, 0], []); for (const e of lg.eventos) if (e.tipo === 'polo') primeira = lg.t; }
  ok(primeira > 1.6 && lg.polos.some((p, i) => Math.hypot(p.pos[0] - antes[i][0], p.pos[2] - antes[i][2]) > 0.5), `Ligeiro corre e responde só depois (${primeira?.toFixed(2)} s)`);
  // pegar com a mão
  const pr = new Rodada(FASES[0], s, { seed: 1 });
  const alvo = pr.polos[0].pos.slice();
  pr.passo(1 / 30, [0, 1.6, 0], [[alvo[0] + 0.3, alvo[1], alvo[2]]]);
  ok(pr.pegos === 0, 'mão a 30 cm não pega');
  pr.passo(1 / 30, [0, 1.6, 0], [[alvo[0] + 0.1, alvo[1], alvo[2]]]);
  ok(pr.pegos === 1 && pr.estado === 'fim', 'mão a 10 cm pega e a rodada acaba');
  // Ventríloquo: tocar no eco apaga
  const v = new Rodada(FASES[6], s, { seed: 2 });
  const falso = v.polos.find(p => p.tipo === 'falso');
  v.passo(1 / 30, [0, 1.6, 0], [falso.pos.slice()]);
  ok(falso.estado === 'apagado' && v.pegos === 0, 'o eco do Ventríloquo some ao ser tocado e não conta');
  let e = 0;
  for (let i = 0; i < 6; i++) { if (v.espia()) e++; v.espiando = 0; }
  ok(e === 3, 'só 3 espiadas');
  // Polo-Rei se divide
  const rei = new Rodada(FASES[7], s, { seed: 8 });
  rei.passo(1 / 30, [0, 1.6, 0], [rei.polos[0].pos.slice()]);
  ok(rei.polos.filter(p => p.tipo === 'filhote').length === 3 && rei.estado === 'jogo', 'Polo-Rei vira 3 filhotes');
}

console.log('Fases com o robô');
{
  for (const [i, f] of FASES.entries()) {
    for (const sala of [salaPadrao(), salaDosPlanos(PLANOS_QUEST)]) {
      const rd = new Rodada(f, sala, { seed: 11 + i });
      const robo = criaRobo(rd);
      let k = 0;
      for (; k < 240 * 30 && rd.estado === 'jogo'; k++) {
        const maos = robo.passo(1 / 30);
        rd.passo(1 / 30, robo.cabeca, maos);
      }
      ok(rd.estado === 'fim', `fase ${i + 1} (${f.nome}, sala ${sala.padrao ? 'padrão' : 'do Quest'}): o robô pega todos (${rd.pegos}/${rd.total} em ${(k / 30).toFixed(0)} s, ${rd.chamadas} Marcos)`);
      if (rd.estado === 'fim' && sala.padrao) console.log(`  fase ${i + 1} ${f.nome}: ${(k / 30).toFixed(1)} s, ${rd.chamadas} Marcos, ${rd.estrelas} estrela(s)`);
    }
  }
}

console.log(falhas ? `\n${falhas} de ${total} verificações falharam` : `\nTudo certo (${total} verificações)`);
process.exit(falhas ? 1 : 0);
