// Liga tudo: realidade mista do Quest (passagem da câmera + mapa da sala), microfone, mãos,
// controles, vibração, áudio 3D, efeitos de eco, menus e o modo PC (sala virtual, teclado e mouse).
import * as THREE from '../vendor/three/three.module.js';
import { salaPadrao, salaDosPlanos, paredeMaisPerto, dentroPoligono } from './sala.js';
import { DetectorVoz } from './voz.js';
import { Rodada, FASES, ESPIADAS } from './jogo.js';
import { Sons } from './audio.js';
import { Panel } from './ui.js';

// ---------- Progresso ----------
const CHAVE = 'cabracega.v1';
function carrega() {
  try { return { feitas: {}, microfone: true, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; }
  catch { return { feitas: {}, microfone: true }; }
}
const save = carrega();
const guarda = () => { try { localStorage.setItem(CHAVE, JSON.stringify(save)); } catch { /* sem armazenamento */ } };

const sons = new Sons();
// ?mudo no endereço: nunca liga o som (usado nos testes automáticos no navegador)
if (new URLSearchParams(location.search).has('mudo')) sons.unlock = () => {};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FUNDO = new THREE.Color(0x05080d);
scene.background = FUNDO;
scene.add(new THREE.HemisphereLight(0x6f86a8, 0x1a1410, 0.6));
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.02, 50);
camera.position.set(0, 1.6, 0);
rig.add(camera);

let modo = 'pc';            // 'pc' | 'vr' | 'ar'
let estado = 'menu';        // 'menu' | 'jogo' | 'pausa' | 'fim'
let sala = salaPadrao();
let salaDoQuest = false;
let rodada = null;
let indice = 0;
let fimT = 0;

// ---------- Sala desenhada (PC e VR; no AR só se não houver mapa) ----------
const salaVis = new THREE.Group();
scene.add(salaVis);
const avisos = [];
function desenhaSala() {
  salaVis.clear();
  avisos.length = 0;
  const y0 = sala.y0 || 0;
  const linhas = [];
  const H = 2.4;
  for (const w of sala.paredes) {
    linhas.push(w.a[0], y0 + 0.01, w.a[1], w.b[0], y0 + 0.01, w.b[1]);
    linhas.push(w.a[0], y0 + H, w.a[1], w.b[0], y0 + H, w.b[1]);
    linhas.push(w.a[0], y0, w.a[1], w.a[0], y0 + H, w.a[1]);
    // aviso vermelho da parede (aparece quando você chega perto)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.comp, H), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set((w.a[0] + w.b[0]) / 2, y0 + H / 2, (w.a[1] + w.b[1]) / 2);
    m.rotation.y = Math.atan2(-(w.b[1] - w.a[1]), w.b[0] - w.a[0]);
    m.renderOrder = 3;
    m.userData.parede = w;
    salaVis.add(m);
    avisos.push(m);
  }
  const mostrar = modo !== 'ar' || !salaDoQuest;
  if (mostrar) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(linhas, 3));
    salaVis.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x4f7aa3, transparent: true, opacity: 0.55 })));
    if (modo !== 'ar') {
      const forma = new THREE.Shape(sala.chao.map(([x, z]) => new THREE.Vector2(x, -z)));
      const chao = new THREE.Mesh(new THREE.ShapeGeometry(forma), new THREE.MeshLambertMaterial({ color: 0x1c2430 }));
      chao.rotation.x = -Math.PI / 2;
      chao.position.y = y0;
      salaVis.add(chao);
    }
    for (const mv of sala.moveis) {
      const tam = [mv.max[0] - mv.min[0], Math.max(0.04, mv.max[1] - mv.min[1]), mv.max[2] - mv.min[2]];
      const centro = [(mv.max[0] + mv.min[0]) / 2, y0 + (mv.max[1] + mv.min[1]) / 2, (mv.max[2] + mv.min[2]) / 2];
      const geo = mv.tipo === 'mesa' ? new THREE.BoxGeometry(tam[0], 0.04, tam[2]) : new THREE.BoxGeometry(...tam);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x6c94bd }));
      e.position.set(centro[0], mv.tipo === 'mesa' ? y0 + mv.max[1] - 0.02 : centro[1], centro[2]);
      salaVis.add(e);
      if (modo !== 'ar') {
        const solido = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: mv.tipo === 'mesa' ? 0x3a2c22 : 0x2a3346 }));
        solido.position.copy(e.position);
        salaVis.add(solido);
        if (mv.tipo === 'mesa') for (const [sx, sz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const perna = new THREE.Mesh(new THREE.BoxGeometry(0.04, mv.max[1] - 0.04, 0.04), solido.material);
          perna.position.set(mv.min[0] + 0.03 + sx * (tam[0] - 0.06), y0 + (mv.max[1] - 0.04) / 2, mv.min[2] + 0.03 + sz * (tam[2] - 0.06));
          salaVis.add(perna);
        }
      }
    }
  }
}

// ---------- A venda (olhos "fechados") ----------
const vendaMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false });
const venda = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), vendaMat);
venda.renderOrder = 1;
camera.add(venda);
let vendaAlvo = 0;

// ---------- Polos (só aparecem espiando, pegos ou no fim) ----------
function texturaRosto(cor) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, cor); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#10223a';
  g.beginPath(); g.arc(50, 58, 7, 0, Math.PI * 2); g.arc(78, 58, 7, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#10223a'; g.lineWidth = 4;
  g.beginPath(); g.arc(64, 70, 14, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const corDaVoz = (f0) => `hsl(${(f0 * 0.37) % 360}, 85%, 65%)`;
const polosVis = new Map();
const polosGrupo = new THREE.Group();
scene.add(polosGrupo);
function criaPolosVis() {
  polosGrupo.clear();
  polosVis.clear();
  for (const p of rodada.polos) visDoPolo(p);
}
function visDoPolo(p) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaRosto(corDaVoz(p.voz)), transparent: true, depthWrite: false }));
  s.scale.setScalar(0.18 * p.tamanho);
  s.renderOrder = 2;
  polosGrupo.add(s);
  polosVis.set(p.id, s);
  return s;
}

// ---------- Ecos (anel que acende na parede ou no chão de onde veio a voz) ----------
const ecos = [];
function eco(de, f0) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(corDaVoz(f0)), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.renderOrder = 2;
  const w = paredeMaisPerto(sala, de[0], de[2]);
  if (w && w.d < 0.9) {
    m.position.set(w.ponto[0], de[1], w.ponto[1]);
    m.lookAt(w.ponto[0] + w.parede.n[0], de[1], w.ponto[1] + w.parede.n[1]);
    m.position.x += w.parede.n[0] * 0.01; m.position.z += w.parede.n[1] * 0.01;
  } else {
    m.position.set(de[0], (sala.y0 || 0) + 0.01, de[2]);
    m.rotation.x = -Math.PI / 2;
  }
  scene.add(m);
  ecos.push({ m, t: 0 });
}
function animaEcos(dt) {
  for (let i = ecos.length - 1; i >= 0; i--) {
    const e = ecos[i];
    e.t += dt;
    const s = 0.08 + e.t * 0.45;
    e.m.scale.setScalar(s);
    e.m.material.opacity = Math.max(0, 0.9 - e.t * 0.8);
    if (e.t > 1.15) { scene.remove(e.m); e.m.geometry.dispose(); e.m.material.dispose(); ecos.splice(i, 1); }
  }
}

// ---------- Placas de texto presas à cabeça ----------
class Placa {
  constructor(w, h, px, py) {
    this.c = document.createElement('canvas');
    this.c.width = px; this.c.height = py;
    this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false }));
    this.mesh.renderOrder = 10;
    this.ultimo = null;
  }
  set(linhas, fundo = true) {
    const k = JSON.stringify(linhas) + fundo;
    if (k === this.ultimo) return;
    this.ultimo = k;
    const g = this.g, W = this.c.width, H = this.c.height;
    g.clearRect(0, 0, W, H);
    if (!linhas.length) { this.tex.needsUpdate = true; return; }
    const rows = [];
    for (const l of linhas) {
      g.font = `${l.bold ? 'bold ' : ''}${l.size}px system-ui, sans-serif`;
      let cur = '';
      for (const w of l.text.split(' ')) {
        const t = cur ? cur + ' ' + w : w;
        if (g.measureText(t).width > W - 60 && cur) { rows.push({ ...l, text: cur }); cur = w; } else cur = t;
      }
      rows.push({ ...l, text: cur });
    }
    const alt = rows.reduce((s, r) => s + r.size * 1.25, 0) + 30;
    if (fundo) {
      g.fillStyle = 'rgba(6,14,26,0.82)';
      const y0 = (H - alt) / 2;
      g.beginPath(); g.roundRect(10, y0, W - 20, alt, 24); g.fill();
      g.strokeStyle = '#7fd6ff'; g.lineWidth = 3; g.stroke();
    }
    let y = (H - alt) / 2 + 15;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const r of rows) {
      g.font = `${r.bold ? 'bold ' : ''}${r.size}px system-ui, sans-serif`;
      g.fillStyle = r.color || '#eaf6ff';
      g.fillText(r.text, W / 2, y + r.size * 0.62);
      y += r.size * 1.25;
    }
    this.tex.needsUpdate = true;
  }
}
const placaInfo = new Placa(0.66, 0.06, 1500, 136);
placaInfo.mesh.position.set(0, -0.26, -0.75);
camera.add(placaInfo.mesh);
const placaMsg = new Placa(0.6, 0.3, 1024, 512);
placaMsg.mesh.position.set(0, 0.06, -0.8);
camera.add(placaMsg.mesh);
let msgT = 0;
function mensagem(linhas, seg = 3) { placaMsg.set(linhas); msgT = seg; }

// ---------- Painel de menu ----------
const panel = new Panel(1.0);
scene.add(panel.mesh);
const raycaster = new THREE.Raycaster();
function poePainel() {
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  camera.getWorldPosition(p);
  camera.getWorldQuaternion(q);
  const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
  const frente = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  panel.mesh.position.copy(p).addScaledVector(frente, modo === 'pc' ? 0.9 : 1.1);
  panel.mesh.position.y = p.y - 0.1;
  panel.mesh.rotation.set(0, yaw, 0);
}
function tela(nome) {
  poePainel();
  panel.show((pn) => {
    if (nome === 'principal') {
      pn.title('Cabra-Cega', 72);
      pn.text('Marco... Polo! Grite "Marco" e pegue os Polos invisíveis na sua sala.', 512, 135, { size: 27, color: '#9db4c6' });
      const prox = proximaFase();
      pn.button(save.feitas[0] ? `Continuar: ${FASES[prox].nome}` : 'Começar', () => comecaFase(prox), 212, 180, 600, 92, { size: 38 });
      pn.button('Escolher fase', () => tela('fases'), 212, 290, 600, 78);
      pn.button('Como jogar', () => tela('ajuda'), 212, 385, 600, 78);
      pn.button(`Microfone: ${save.microfone ? 'sim' : 'não'}`, () => { save.microfone = !save.microfone; guarda(); if (save.microfone) iniciaMicrofone(); tela('principal'); }, 212, 480, 290, 72, { size: 28 });
      pn.button(salaDoQuest ? 'Sala: do Quest' : 'Sala: padrão', () => { mapearSala(); tela('principal'); }, 522, 480, 290, 72, { size: 28 });
      pn.text(textoSala(), 512, 590, { size: 22, color: '#9db4c6' });
      pn.text(microfoneOk ? 'Microfone ligado: fale "Marco!"' : 'Sem microfone: use A/X, pinça ou a tecla M para chamar "Marco"', 512, 630, { size: 22, color: microfoneOk ? '#8cf0b0' : '#ffcf7a' });
    } else if (nome === 'fases') {
      pn.title('Fases', 64);
      FASES.forEach((f, i) => {
        const col = i % 4, lin = Math.floor(i / 4);
        const est = save.feitas[i];
        pn.tile(56 + col * 232, 115 + lin * 215, 214, 195, { num: i + 1, name: f.nome, stars: est || 0, done: est > 0, locked: i > 0 && !save.feitas[i - 1] && i > proximaFase(), action: () => comecaFase(i) });
      });
      pn.button('Voltar', () => tela(estado === 'pausa' ? 'pausa' : 'principal'), 362, 565, 300, 80);
    } else if (nome === 'ajuda') {
      pn.title('Como jogar', 64);
      const l = [
        'Os Polos são invisíveis e moram na sua sala.',
        'Diga "MARCO!" e cada um responde "POLO!" de onde está.',
        'Ande até o som e pegue com a mão. O controle vibra',
        'mais forte quanto mais perto (quente ou frio).',
        'Espiar: B/Y ou as duas mãos na frente dos olhos (3 vezes).',
        'Sem microfone: A/X ou pinça chamam "Marco".',
        'Paredes ficam vermelhas quando você chega perto.',
        'PC: WASD anda, mouse olha, clique pega, M/G/N chama,',
        'E espia, C abaixa, Esc pausa.',
      ];
      l.forEach((t, i) => pn.text(t, 70, 130 + i * 50, { size: 27, align: 'left' }));
      pn.button('Voltar', () => tela('principal'), 362, 600, 300, 80);
    } else if (nome === 'pausa') {
      pn.title('Pausa', 70);
      pn.text(`Fase ${indice + 1}: ${FASES[indice].nome}`, 512, 140, { size: 30, color: '#9db4c6' });
      pn.button('Continuar', () => { estado = 'jogo'; panel.hide(); }, 262, 190, 500, 84);
      pn.button('Recomeçar a fase', () => comecaFase(indice), 262, 290, 500, 84);
      pn.button('Escolher fase', () => tela('fases'), 262, 390, 500, 84);
      pn.button('Menu principal', () => menu(), 262, 490, 500, 84);
    } else if (nome === 'fim') {
      const est = rodada.estrelas;
      pn.title(indice === FASES.length - 1 ? 'Você é o Mestre da Cabra-Cega!' : 'Todos os Polos pegos!', 74);
      pn.text('★'.repeat(est) + '☆'.repeat(3 - est), 512, 170, { size: 80, color: '#ffd76a' });
      pn.text(`Tempo ${rodada.t.toFixed(0)} s · ${rodada.chamadas} "Marco" (meta ${rodada.fase.par}) · ${rodada.espiadas} espiada(s)`, 512, 250, { size: 28 });
      pn.text('Estrelas: terminar · poucos "Marco" · sem espiar', 512, 292, { size: 22, color: '#9db4c6' });
      if (indice < FASES.length - 1) pn.button('Próxima fase', () => comecaFase(indice + 1), 262, 340, 500, 96, { size: 38 });
      pn.button('Repetir', () => comecaFase(indice), 262, 456, 245, 80);
      pn.button('Fases', () => tela('fases'), 517, 456, 245, 80);
      pn.button('Menu principal', () => menu(), 262, 556, 500, 80);
    }
  });
}
function proximaFase() {
  for (let i = 0; i < FASES.length; i++) if (!save.feitas[i]) return i;
  return 0;
}
function textoSala() {
  if (modo === 'pc') return 'No PC: sala virtual de 3 x 3 m com mesa e sofá.';
  if (salaDoQuest) return `Usando a sua sala (${sala.moveis.length} móvel/móveis encontrados).`;
  return 'Sem mapa da sala: área de 3 x 3 m à sua frente. Configure o espaço no Quest para usar seus móveis.';
}

// ---------- Fluxo ----------
function menu() {
  estado = 'menu';
  rodada = null;
  polosGrupo.clear();
  vendaAlvo = 0;
  tela('principal');
}

function cabecaAgora() {
  const p = new THREE.Vector3();
  camera.getWorldPosition(p);
  return [p.x, p.y, p.z];
}

function comecaFase(i) {
  indice = i;
  atualizaSala();
  rodada = new Rodada(FASES[i], sala, { seed: (Date.now() % 100000) + i, jogador: cabecaAgora() });
  criaPolosVis();
  estado = 'jogo';
  panel.hide();
  robo = null;
  vendaAlvo = modo === 'ar' ? 0.86 : 0.55;
  mensagem([
    { text: `${i + 1}. ${FASES[i].nome}`, size: 64, bold: true, color: '#7fd6ff' },
    { text: FASES[i].dica, size: 40 },
    { text: microfoneOk ? 'Diga "MARCO!"' : (modo === 'pc' ? 'Aperte M para chamar "Marco"' : 'Aperte A/X ou faça pinça para chamar "Marco"'), size: 40, bold: true, color: '#ffd76a' },
  ], 7);
}

function chama(tipo) {
  if (estado !== 'jogo' || !rodada) return;
  rodada.chama(tipo, cabecaAgora());
  sons.ouviu(tipo);
  const txt = tipo === 'grito' ? 'MARCO!!' : tipo === 'sussurro' ? 'marco...' : 'Marco!';
  mensagem([{ text: txt, size: tipo === 'grito' ? 120 : tipo === 'sussurro' ? 60 : 90, bold: true, color: '#ffd76a' }], 1.2);
}

function espia() {
  if (estado !== 'jogo' || !rodada) return;
  if (rodada.espia()) sons.espiar();
  else if (rodada.espiadas >= ESPIADAS) mensagem([{ text: 'Sem espiadas nesta fase!', size: 56, bold: true }], 1.5);
}

function pausa() {
  if (estado === 'jogo') { estado = 'pausa'; tela('pausa'); }
  else if (estado === 'pausa') { estado = 'jogo'; panel.hide(); }
}

// ---------- Mapa da sala do Quest (planos) ----------
let planosVistos = [];
function leituraPlanos(frame) {
  if (!frame || !frame.detectedPlanes || !refSpace) return;
  const lista = [];
  frame.detectedPlanes.forEach((plano) => {
    const pose = frame.getPose(plano.planeSpace, refSpace);
    if (!pose) return;
    const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
    const pontos = plano.polygon.map(pt => { const v = new THREE.Vector3(pt.x, pt.y, pt.z).applyMatrix4(m); return [v.x, v.y, v.z]; });
    lista.push({ rotulo: plano.semanticLabel || '', orientacao: (plano.orientation || '').toLowerCase(), pontos });
  });
  if (lista.length) planosVistos = lista;
}
function atualizaSala() {
  const s = modo === 'ar' && planosVistos.length ? salaDosPlanos(planosVistos) : null;
  salaDoQuest = !!s;
  sala = s || salaPadrao();
  desenhaSala();
}
async function mapearSala() {
  const ses = renderer.xr.getSession();
  if (ses && ses.initiateRoomCapture) { try { await ses.initiateRoomCapture(); } catch { /* o Quest recusou */ } }
  atualizaSala();
}

// ---------- Microfone ----------
let microfoneOk = false;
let detector = null;
const filaVoz = [];
async function iniciaMicrofone() {
  if (microfoneOk || !save.microfone || !navigator.mediaDevices?.getUserMedia) return;
  try {
    sons.unlock();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
    const ctx = sons.ctx;
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(1024, 1, 1);
    const mudo = ctx.createGain();
    mudo.gain.value = 0;
    detector = new DetectorVoz({ taxa: ctx.sampleRate });
    proc.onaudioprocess = (e) => {
      const r = detector.processa(e.inputBuffer.getChannelData(0));
      if (r) filaVoz.push(r);
    };
    src.connect(proc); proc.connect(mudo); mudo.connect(ctx.destination);
    microfoneOk = true;
  } catch (err) {
    console.warn('Microfone indisponível:', err);
    microfoneOk = false;
  }
}

// ---------- VR/AR: controles e mãos ----------
let refSpace = null;
const ctrls = [];
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  const hand = renderer.xr.getHand(i);
  rig.add(ctrl, grip, hand);
  const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x7fd6ff }));
  laser.visible = false;
  ctrl.add(laser);
  const brilho = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.8 }));
  brilho.renderOrder = 4;
  grip.add(brilho);
  const e = { ctrl, grip, hand, laser, brilho, source: null, botoes: [], hover: -1, vibraT: 0, coracaoT: 0 };
  ctrls.push(e);
  ctrl.addEventListener('connected', (ev) => { e.source = ev.data; });
  ctrl.addEventListener('disconnected', () => { e.source = null; });
  ctrl.addEventListener('selectstart', () => {
    sons.unlock();
    if (panel.visible && e.hover >= 0) { sons.clique(); panel.actionAt(e.hover)?.(); return; }
    if (estado === 'jogo' && e.source?.hand && !microfoneOk) { chama('fala'); sons.marco(); }
  });
}
const PONTAS = ['index-finger-tip', 'middle-finger-tip', 'thumb-tip', 'ring-finger-tip', 'middle-finger-metacarpal'];
const _v = new THREE.Vector3();
// Pontos de pegar (mundo): pontas dos dedos e palma, ou a posição do controle.
function maosAgora() {
  const pts = [];
  for (const e of ctrls) {
    if (!e.source) continue;
    if (e.source.hand && e.hand.joints) {
      for (const n of PONTAS) { const j = e.hand.joints[n]; if (j) { j.getWorldPosition(_v); pts.push([_v.x, _v.y, _v.z]); } }
    } else { e.grip.getWorldPosition(_v); pts.push([_v.x, _v.y, _v.z]); }
  }
  return pts;
}
function pulso(e, v, ms) { try { e.source?.gamepad?.hapticActuators?.[0]?.pulse?.(v, ms); } catch { /* sem vibração */ } }

// "Quente ou frio": vibração no controle (ou batimento de coração saindo da mão).
function quenteFrio(dt) {
  if (estado !== 'jogo' || !rodada) return;
  for (const e of ctrls) {
    if (!e.source) continue;
    const mao = e.source.hand ? e.hand.joints?.['middle-finger-metacarpal'] : e.grip;
    if (!mao) continue;
    mao.getWorldPosition(_v);
    const d = rodada.maisPerto([_v.x, _v.y, _v.z]);
    if (d > 1.3) continue;
    const intervalo = 0.12 + d * 0.55;
    if (e.source.hand) {
      e.coracaoT -= dt;
      if (e.coracaoT <= 0) { e.coracaoT = intervalo * 1.4; sons.coracao([_v.x, _v.y, _v.z], 1 - d / 1.3); }
    } else {
      e.vibraT -= dt;
      if (e.vibraT <= 0) { e.vibraT = intervalo; pulso(e, 0.12 + 0.75 * (1 - d / 1.3), 40); }
    }
  }
}

// Botões: A/X chama "Marco", B/Y espia, apertar o direcional pausa.
function botoesXR() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[4] && !e.botoes[4]) { if (estado === 'jogo') { chama('fala'); if (!microfoneOk) sons.marco(); } }
    if (b[5] && !e.botoes[5]) espia();
    if (b[3] && !e.botoes[3]) pausa();
    e.botoes = b;
  }
}

// As duas mãos na frente dos olhos por um instante = espiar.
let maosNosOlhos = 0;
function gestoEspiar(dt) {
  if (estado !== 'jogo') return;
  const cab = new THREE.Vector3();
  camera.getWorldPosition(cab);
  let n = 0;
  for (const e of ctrls) {
    if (!e.source?.hand) continue;
    const j = e.hand.joints?.['middle-finger-metacarpal'];
    if (j && j.getWorldPosition(_v).distanceTo(cab) < 0.17) n++;
  }
  maosNosOlhos = n === 2 ? maosNosOlhos + dt : 0;
  if (maosNosOlhos > 0.35) { maosNosOlhos = -1.5; espia(); }
}

function raiosMenu() {
  let hover = -1;
  for (const e of ctrls) {
    e.hover = -1;
    e.laser.visible = modo !== 'pc' && panel.visible && !!e.source;
    if (!e.laser.visible) continue;
    const o = new THREE.Vector3(), q = new THREE.Quaternion();
    e.ctrl.getWorldPosition(o); e.ctrl.getWorldQuaternion(q);
    raycaster.set(o, new THREE.Vector3(0, 0, -1).applyQuaternion(q));
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.scale.z = hit ? hit.distance : 1.5;
    e.hover = panel.pick(hit?.uv);
    if (e.hover >= 0) hover = e.hover;
  }
  if (modo === 'pc' && panel.visible) {
    raycaster.setFromCamera(mouseNdc, camera);
    hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
    renderer.domElement.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
  }
  if (panel.visible) panel.setHover(hover);
}

// ---------- Entrar no Quest ----------
const btnXR = document.getElementById('xr');
let suportaAR = false, suportaVR = false;
async function preparaXR() {
  if (!navigator.xr) { btnXR.textContent = window.isSecureContext ? 'Realidade mista não disponível neste navegador' : 'VR precisa de HTTPS'; btnXR.disabled = true; return; }
  suportaAR = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  suportaVR = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!suportaAR && !suportaVR) { btnXR.textContent = 'VR não disponível neste navegador'; btnXR.disabled = true; return; }
  btnXR.textContent = suportaAR ? 'Entrar (realidade mista)' : 'Entrar em VR';
  btnXR.disabled = false;
  btnXR.onclick = async () => {
    sons.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    await iniciaMicrofone();
    try {
      let ses;
      if (suportaAR) {
        ses = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['local-floor'], optionalFeatures: ['plane-detection', 'hand-tracking', 'anchors'] });
        modo = 'ar';
      } else {
        ses = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] });
        modo = 'vr';
      }
      await renderer.xr.setSession(ses);
      refSpace = renderer.xr.getReferenceSpace();
      scene.background = modo === 'ar' ? null : FUNDO;
      renderer.setClearColor(0x000000, modo === 'ar' ? 0 : 1);
      camera.position.set(0, 0, 0);
      btnXR.textContent = 'Sair';
      ses.addEventListener('end', () => { modo = 'pc'; scene.background = FUNDO; camera.position.set(0, 1.6, 0); refSpace = null; btnXR.textContent = suportaAR ? 'Entrar (realidade mista)' : 'Entrar em VR'; atualizaSala(); menu(); });
      ses.addEventListener('visibilitychange', () => { if (ses.visibilityState !== 'visible' && estado === 'jogo') pausa(); });
      setTimeout(() => { atualizaSala(); menu(); }, 1500);   // espera os planos da sala chegarem
    } catch (err) {
      console.error(err);
      btnXR.textContent = 'Erro ao entrar';
    }
  };
}
preparaXR();

// ---------- PC: andar, olhar, pegar ----------
const teclas = new Set();
const mouseNdc = new THREE.Vector2();
let yaw = 0, pitch = -0.15, agachado = false, alcance = 0;
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  teclas.add(k);
  if (modo !== 'pc') return;
  if (k === 'escape') { if (estado === 'jogo' || estado === 'pausa') pausa(); }
  if (estado !== 'jogo') return;
  if (k === 'm') { sons.unlock(); chama('fala'); sons.marco(); }
  if (k === 'g') { sons.unlock(); chama('grito'); sons.marco(); }
  if (k === 'n') { sons.unlock(); chama('sussurro'); }
  if (k === 'e') espia();
  if (k === 'c') agachado = !agachado;
  if (k === 'f8') ligaRobo();
});
window.addEventListener('keyup', (e) => teclas.delete(e.key.toLowerCase()));
// Esc solta o mouse antes de chegar no jogo: soltou o mouse no meio da fase = pausa.
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && modo === 'pc' && estado === 'jogo') pausa(); });
renderer.domElement.addEventListener('mousemove', (e) => {
  mouseNdc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (document.pointerLockElement === renderer.domElement) {
    yaw -= e.movementX * 0.0025;
    pitch = clamp(pitch - e.movementY * 0.0025, -1.4, 1.4);
  }
});
renderer.domElement.addEventListener('mousedown', () => {
  sons.unlock();
  if (modo !== 'pc') return;
  if (panel.visible) {
    raycaster.setFromCamera(mouseNdc, camera);
    const a = panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv));
    if (a) { sons.clique(); a(); }
    return;
  }
  if (document.pointerLockElement !== renderer.domElement) { renderer.domElement.requestPointerLock?.(); return; }
  alcance = 0.35;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function andaPC(dt) {
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  const alvoY = agachado ? 0.95 : 1.6;
  camera.position.y += (alvoY - camera.position.y) * Math.min(1, dt * 8);
  if (estado !== 'jogo' || robo) return;
  const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const mv = new THREE.Vector3();
  if (teclas.has('w')) mv.add(f); if (teclas.has('s')) mv.sub(f);
  if (teclas.has('d')) mv.add(r); if (teclas.has('a')) mv.sub(r);
  if (mv.lengthSq() === 0) return;
  mv.normalize().multiplyScalar(1.3 * dt);
  const nx = camera.position.x + mv.x, nz = camera.position.z + mv.z;
  if (dentroPoligono(sala.chao, nx, nz) && paredeMaisPerto(sala, nx, nz).d > 0.15) { camera.position.x = nx; camera.position.z = nz; }
}
// No PC a "mão" é um ponto que avança na direção do olhar quando você clica.
function maosPC() {
  if (alcance <= 0) return [];
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  camera.getWorldPosition(o); camera.getWorldDirection(d);
  return [0.25, 0.4, 0.55, 0.7].map(k => { const p = o.clone().addScaledVector(d, k); return [p.x, p.y, p.z]; });
}

// ---------- Robô (F8 no PC): mostra uma solução ----------
let robo = null;
async function ligaRobo() {
  if (!rodada) return;
  if (robo) { robo = null; return; }
  const { criaRobo } = await import('../tests/robo.js');
  robo = criaRobo(rodada, { cabeca: cabecaAgora() });
}

// ---------- Eventos da rodada → som e efeitos ----------
function trataEventos() {
  for (const e of rodada.eventos) {
    if (e.tipo === 'polo') { sons.polo(e.voz, e.de, e.tamanho > 1.5); eco(e.de, e.voz); detector?.tapaOuvidos(0.8); }
    else if (e.tipo === 'risadinha') { sons.risadinha(e.voz, e.de); detector?.tapaOuvidos(0.6); }
    else if (e.tipo === 'pego') { sons.pego(e.de); mensagem([{ text: `Peguei! ${rodada.pegos}/${rodada.total}`, size: 80, bold: true, color: '#8cf0b0' }], 1.5); for (const c of ctrls) pulso(c, 1, 120); }
    else if (e.tipo === 'apagou') { sons.apagou(e.de); mensagem([{ text: 'Era só eco!', size: 70, bold: true, color: '#ffcf7a' }], 1.5); }
    else if (e.tipo === 'divide') { sons.divide(e.de); for (const p of rodada.polos) if (!polosVis.has(p.id)) visDoPolo(p); mensagem([{ text: 'O Rei se dividiu em três!', size: 64, bold: true, color: '#ffcf7a' }], 2); }
    else if (e.tipo === 'foge') { const p = rodada.polos[e.id]; sons.foge(p.pos); }
    else if (e.tipo === 'fim') {
      sons.vitoria();
      save.feitas[indice] = Math.max(save.feitas[indice] || 0, e.estrelas);
      guarda();
      estado = 'fim';
      fimT = 1.6;
      vendaAlvo = 0;
    }
  }
}

// ---------- Laço principal ----------
let ultimo = performance.now(), avisoT = 0;
const frente = new THREE.Vector3(), cima = new THREE.Vector3(), cabV = new THREE.Vector3(), qc = new THREE.Quaternion();
function quadro(t, frame) {
  const agora = performance.now();
  const dt = Math.min(0.05, (agora - ultimo) / 1000);
  ultimo = agora;
  if (frame) leituraPlanos(frame);
  if (modo === 'pc') andaPC(dt);
  else { botoesXR(); gestoEspiar(dt); }

  // ouvido do jogador
  camera.getWorldPosition(cabV); camera.getWorldQuaternion(qc);
  frente.set(0, 0, -1).applyQuaternion(qc); cima.set(0, 1, 0).applyQuaternion(qc);
  sons.ouvinte([cabV.x, cabV.y, cabV.z], [frente.x, frente.y, frente.z], [cima.x, cima.y, cima.z]);

  // voz do microfone
  while (filaVoz.length) { const v = filaVoz.shift(); if (estado === 'jogo') chama(v.tipo); }

  if (estado === 'jogo' && rodada) {
    let maos = modo === 'pc' ? maosPC() : maosAgora();
    if (robo) {
      maos = robo.passo(dt);
      if (modo === 'pc') { camera.position.x = robo.cabeca[0]; camera.position.z = robo.cabeca[2]; camera.position.y = Math.max(0.6, maos[0]?.[1] ?? 1.6); }
    }
    rodada.passo(dt, robo ? robo.cabeca : [cabV.x, cabV.y, cabV.z], maos);
    trataEventos();
    quenteFrio(dt);
    // aviso de parede
    let perto = Infinity;
    for (const m of avisos) {
      const w = m.userData.parede;
      const d = paredeMaisPerto({ paredes: [w] }, cabV.x, cabV.z).d;
      m.material.opacity = d < 0.45 ? 0.45 * (1 - d / 0.45) : 0;
      perto = Math.min(perto, d);
    }
    avisoT -= dt;
    if (perto < 0.35 && avisoT <= 0) { sons.parede(); avisoT = 0.8; }
  } else for (const m of avisos) m.material.opacity = 0;
  if (alcance > 0) alcance -= dt;
  if (estado === 'fim') { fimT -= dt; if (fimT <= 0 && !panel.visible) tela('fim'); }

  // Polos visíveis: espiando, pegos (giram em volta de você) ou no fim
  if (rodada) {
    const vendo = rodada.espiando > 0 || estado === 'fim';
    let k = 0;
    for (const p of rodada.polos) {
      const s = polosVis.get(p.id);
      if (!s) continue;
      if (p.estado === 'pego') {
        const a = t / 1000 * 1.2 + k++ * 1.3;
        s.position.set(cabV.x + Math.cos(a) * 0.55, cabV.y + 0.25 + Math.sin(a * 2) * 0.05, cabV.z + Math.sin(a) * 0.55);
        s.scale.setScalar(0.1);
        s.visible = true;
      } else {
        s.position.set(...p.pos);
        s.scale.setScalar(0.18 * p.tamanho * (1 + 0.08 * Math.sin(t / 150 + p.id)));
        s.visible = p.estado === 'livre' && vendo;
      }
    }
  }
  const venda_ = rodada && rodada.espiando > 0 ? 0.12 : vendaAlvo;
  vendaMat.opacity += (venda_ - vendaMat.opacity) * Math.min(1, dt * 6);
  venda.visible = vendaMat.opacity > 0.01;
  animaEcos(dt);

  // textos
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) placaMsg.set([]); }
  if (rodada && estado === 'jogo') {
    placaInfo.set([{ text: `${indice + 1}. ${rodada.fase.nome} · pegos ${rodada.pegos}/${rodada.total} · Marcos ${rodada.chamadas} · espiadas ${ESPIADAS - rodada.espiadas}${microfoneOk ? ' · microfone ligado' : ''}`, size: 44, bold: true }]);
  } else placaInfo.set([]);
  placaInfo.mesh.visible = estado === 'jogo';
  dicaPC();
  raiosMenu();
  renderer.render(scene, camera);
}

const dicaEl = document.getElementById('dica');
function dicaPC() {
  const txt = modo !== 'pc' ? '' : estado === 'jogo'
    ? 'Clique na tela para olhar com o mouse · WASD anda · C abaixa · M "Marco" (G grita, N sussurra) · clique pega · E espia · Esc pausa · F8 robô'
    : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar (realidade mista)"';
  if (dicaEl.textContent !== txt) dicaEl.textContent = txt;
}

// Para testes no console: cc.comecaFase(0); cc.ligaRobo()
window.cc = { comecaFase, ligaRobo, chama, get ecos() { return ecos.length; }, get rodada() { return rodada; }, save, menu, avanca: (seg) => { for (let i = 0; i < seg * 60; i++) { ultimo = performance.now() - 1000 / 60; quadro(performance.now(), null); } } };

desenhaSala();
menu();
renderer.setAnimationLoop(quadro);
