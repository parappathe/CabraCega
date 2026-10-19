// Painel de menu flutuante (o mesmo no PC e no VR): desenhado num canvas e mostrado num
// plano 3D. No VR se aponta com o controle; no PC se clica com o mouse.
import * as THREE from '../vendor/three/three.module.js';

const W = 1024, H = 720;
const C = {
  bg: 'rgba(8,16,28,0.95)', edge: '#7fd6ff', text: '#eaf6ff', dim: '#9db4c6',
  btn: '#17324d', btnHover: '#265483', btnOn: '#7fd6ff', btnOnText: '#08131f', lock: '#152230',
};

export class Panel {
  constructor(width = 1.1) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const height = width * H / W;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false }));
    this.mesh.renderOrder = 10;
    this.buttons = [];
    this.hover = -1;
    this.drawFn = null;
  }

  show(drawFn) { this.drawFn = drawFn; this.hover = -1; this.mesh.visible = true; this.redraw(); }
  hide() { this.mesh.visible = false; this.drawFn = null; }
  get visible() { return this.mesh.visible; }

  redraw() {
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    g.fillStyle = C.bg; roundRect(g, 4, 4, W - 8, H - 8, 28); g.fill();
    g.strokeStyle = C.edge; g.lineWidth = 4; g.stroke();
    this.buttons = [];
    this.drawFn?.(this);
    this.tex.needsUpdate = true;
  }

  // Ferramentas de desenho para as telas.
  title(text, y = 70) {
    const g = this.ctx;
    g.fillStyle = C.edge; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, W / 2, y);
  }
  text(text, x, y, { size = 32, color = C.text, align = 'center', bold = false } = {}) {
    const g = this.ctx;
    g.fillStyle = color; g.font = `${bold ? 'bold ' : ''}${size}px sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
    g.fillText(text, x, y);
  }
  button(label, action, x, y, w, h, { on = false, locked = false, size = 34, sub = null } = {}) {
    const g = this.ctx;
    const i = this.buttons.length;
    this.buttons.push({ x, y, w, h, action: locked ? null : action });
    g.fillStyle = locked ? C.lock : on ? C.btnOn : (i === this.hover ? C.btnHover : C.btn);
    roundRect(g, x, y, w, h, 16); g.fill();
    if (i === this.hover && !locked) { g.strokeStyle = C.edge; g.lineWidth = 3; g.stroke(); }
    g.fillStyle = on ? C.btnOnText : locked ? C.dim : C.text;
    g.font = `bold ${size}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, x + w / 2, y + h / 2 - (sub ? 14 : 0));
    if (sub) { g.font = `24px sans-serif`; g.fillStyle = on ? C.btnOnText : C.dim; g.fillText(sub, x + w / 2, y + h / 2 + 20); }
  }
  // Quadradinho de fase no menu: número, nome, vaga-lumes (estrelas) e se está liberada.
  tile(x, y, w, h, { num, name, stars = 0, done = false, locked = false, action }) {
    const g = this.ctx;
    const i = this.buttons.length;
    this.buttons.push({ x, y, w, h, action: locked ? null : action });
    g.fillStyle = locked ? C.lock : (i === this.hover ? C.btnHover : C.btn);
    roundRect(g, x, y, w, h, 16); g.fill();
    if (!locked && !done) { g.strokeStyle = C.edge; g.lineWidth = 3; g.stroke(); }
    if (i === this.hover && !locked) { g.strokeStyle = C.text; g.lineWidth = 3; g.stroke(); }
    this.text(locked ? '🔒' : String(num), x + w / 2, y + 48, { size: 52, bold: true, color: locked ? C.dim : C.edge });
    this.text(locked ? '' : name, x + w / 2, y + 102, { size: 21, color: C.text });
    if (done) this.text('★'.repeat(stars) + '☆'.repeat(3 - stars), x + w / 2, y + h - 30, { size: 30, color: '#ffd76a' });
  }

  // uv do raycast → índice do botão
  pick(uv) {
    if (!uv) return -1;
    const x = uv.x * W, y = (1 - uv.y) * H;
    return this.buttons.findIndex(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  }
  setHover(i) { if (i !== this.hover) { this.hover = i; this.redraw(); } }
  actionAt(i) { return i >= 0 ? this.buttons[i]?.action : null; }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Painel pequeno de texto (FPS, avisos) preso à câmera.
export class Label {
  constructor(width = 0.16, px = 256, py = 64) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = px; this.canvas.height = py;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * py / px),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false }));
    this.mesh.renderOrder = 11;
    this.last = null;
  }
  set(text) {
    if (text === this.last) return;
    this.last = text;
    const g = this.ctx, w = this.canvas.width, h = this.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffdf6e'; g.font = `bold ${Math.round(h * 0.55)}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
    this.tex.needsUpdate = true;
  }
}
