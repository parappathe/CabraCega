// A sala onde os Polos se escondem: chão (polígono), paredes, móveis e esconderijos.
// Vem do mapa da sala do Quest (planos) ou de uma sala padrão de 3 x 3 m. Sem navegador.
// Coordenadas em metros: y para cima; o jogador começa em (0, 0, 0) olhando para -z.

export const ALTURA_MIN = 0.12, ALTURA_MAX = 1.9;

// Sala padrão (sem mapa): 3 x 3 m na frente do jogador, com uma mesa e um sofá.
export function salaPadrao() {
  return montaSala({
    chao: [[-1.5, 0.4], [1.5, 0.4], [1.5, -2.6], [-1.5, -2.6]],
    moveis: [
      { tipo: 'mesa', min: [0.35, 0, -1.9], max: [1.15, 0.75, -1.25] },
      { tipo: 'sofa', min: [-1.5, 0, -2.25], max: [-0.65, 0.45, -1.2] },
    ],
    padrao: true,
  });
}

// Sala a partir dos planos do Quest: [{ rotulo, orientacao, pontos: [[x,y,z], ...] }] (no mundo).
export function salaDosPlanos(planos) {
  const chaoP = planos.find(p => p.rotulo === 'floor') ||
    planos.filter(p => p.orientacao === 'horizontal').sort((a, b) => minY(a) - minY(b))[0];
  if (!chaoP || chaoP.pontos.length < 3) return null;
  const y0 = media(chaoP.pontos.map(p => p[1]));
  let chao = chaoP.pontos.map(p => [p[0], p[2]]);
  if (Math.abs(area(chao)) < 1.5) return null;          // pequeno demais: usa a sala padrão
  if (area(chao) < 0) chao = chao.reverse();
  const moveis = [];
  for (const p of planos) {
    if (p === chaoP || p.orientacao !== 'horizontal') continue;
    const alt = media(p.pontos.map(q => q[1])) - y0;
    if (alt < 0.15 || alt > 1.3) continue;               // teto, tapete ou prateleira alta
    const xs = p.pontos.map(q => q[0]), zs = p.pontos.map(q => q[2]);
    const tipo = /table|desk/.test(p.rotulo || '') ? 'mesa' : /couch|sofa|bed/.test(p.rotulo || '') ? 'sofa' : alt > 0.6 ? 'mesa' : 'sofa';
    moveis.push({ tipo, min: [Math.min(...xs), 0, Math.min(...zs)], max: [Math.max(...xs), alt, Math.max(...zs)] });
  }
  return montaSala({ chao, moveis, y0, padrao: false });
}

function montaSala({ chao, moveis, y0 = 0, padrao }) {
  const paredes = chao.map((a, i) => {
    const b = chao[(i + 1) % chao.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    // normal apontando para dentro da sala
    let n = [-dz / l, dx / l];
    const meio = [(a[0] + b[0]) / 2 + n[0] * 0.05, (a[1] + b[1]) / 2 + n[1] * 0.05];
    if (!dentroPoligono(chao, meio[0], meio[1])) n = [-n[0], -n[1]];
    return { a, b, n, comp: l };
  });
  const s = { chao, paredes, moveis, y0, padrao };
  s.esconderijos = esconderijos(s);
  return s;
}

const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const minY = (p) => Math.min(...p.pontos.map(q => q[1]));
function area(pol) {
  let s = 0;
  for (let i = 0; i < pol.length; i++) { const a = pol[i], b = pol[(i + 1) % pol.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

export function dentroPoligono(pol, x, z) {
  let dentro = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, zi] = pol[i], [xj, zj] = pol[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Distância (no chão) até a parede mais perto, e qual é.
export function paredeMaisPerto(sala, x, z) {
  let melhor = null, dm = Infinity;
  for (const w of sala.paredes) {
    const [ax, az] = w.a, [bx, bz] = w.b;
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
    const px = ax + vx * t, pz = az + vz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < dm) { dm = d; melhor = { parede: w, d, ponto: [px, pz] }; }
  }
  return melhor;
}

// Dentro da sala, longe das paredes pelo menos `margem`, e fora dos móveis maciços.
export function livre(sala, p, margem = 0.2) {
  const [x, y, z] = p;
  if (y < ALTURA_MIN - 1e-6 || y > ALTURA_MAX + 1e-6) return false;
  if (!dentroPoligono(sala.chao, x, z)) return false;
  if (paredeMaisPerto(sala, x, z).d < margem) return false;
  for (const m of sala.moveis) {
    const dentroXZ = x > m.min[0] - 0.05 && x < m.max[0] + 0.05 && z > m.min[2] - 0.05 && z < m.max[2] + 0.05;
    if (!dentroXZ) continue;
    if (m.tipo === 'mesa') { if (y > m.max[1] - 0.08 && y < m.max[1] + 0.05) return false; }   // dentro do tampo
    else if (y < m.max[1] + 0.05) return false;                                                // dentro do sofá
  }
  return true;
}

// De onde o Papagaio "responde": o ponto do outro lado do jogador (ouviu atrás, ele está na frente).
export function espelho(p, jogador) {
  return [2 * jogador[0] - p[0], p[1], 2 * jogador[2] - p[2]];
}

export function centro(sala) {
  return [media(sala.chao.map(p => p[0])), media(sala.chao.map(p => p[1]))];
}

// Esconderijos: debaixo da mesa, atrás e em cima do sofá, cantos baixos, alto perto da parede.
function esconderijos(sala) {
  const l = [];
  for (const m of sala.moveis) {
    const cx = (m.min[0] + m.max[0]) / 2, cz = (m.min[2] + m.max[2]) / 2;
    if (m.tipo === 'mesa') l.push({ p: [cx, 0.22, cz], baixo: true, nome: 'debaixo da mesa' });
    else {
      l.push({ p: [cx, m.max[1] + 0.12, cz], baixo: true, nome: 'em cima do sofá' });
      for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const p = [cx + dx * ((m.max[0] - m.min[0]) / 2 + 0.22), 0.2, cz + dz * ((m.max[2] - m.min[2]) / 2 + 0.22)];
        l.push({ p, baixo: true, nome: 'atrás do sofá' });
      }
    }
  }
  const c = centro(sala);
  for (const [x, z] of sala.chao) {
    const k = 0.35 / Math.max(0.1, Math.hypot(c[0] - x, c[1] - z));
    l.push({ p: [x + (c[0] - x) * k, 0.18, z + (c[1] - z) * k], baixo: true, nome: 'no canto' });
    l.push({ p: [x + (c[0] - x) * k * 1.2, 1.75, z + (c[1] - z) * k * 1.2], baixo: false, nome: 'lá no alto' });
  }
  return l.filter(e => livre(sala, e.p, 0.15));
}

// Ponto livre ao acaso (para passear), longe pelo menos `longe` de um ponto evitado.
export function pontoAoAcaso(sala, rnd, { y = null, evita = null, longe = 0 } = {}) {
  const xs = sala.chao.map(p => p[0]), zs = sala.chao.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  for (let i = 0; i < 300; i++) {
    const p = [x0 + (x1 - x0) * rnd(), y ?? (0.3 + 1.3 * rnd()), z0 + (z1 - z0) * rnd()];
    if (!livre(sala, p, 0.3)) continue;
    if (evita && Math.hypot(p[0] - evita[0], p[2] - evita[2]) < longe) continue;
    return p;
  }
  const c = centro(sala);
  return [c[0], y ?? 1, c[1]];
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
