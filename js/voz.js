// Detector de voz: ouve o microfone em pedacinhos e avisa quando você termina de falar alguma
// coisa, dizendo se foi GRITO, FALA ou SUSSURRO. Não reconhece palavras: qualquer "Marco!" vale.
// Usa a energia (volume) e a "aspereza" do som (cruzamentos por zero: sussurro é um chiado).
// Sem navegador: recebe Float32Array de amostras.

const db = (v) => 20 * Math.log10(Math.max(v, 1e-6));

export class DetectorVoz {
  constructor({ taxa = 48000 } = {}) {
    this.taxa = taxa;
    this.fundo = -60;          // ruído de fundo (dBFS), aprende sozinho
    this.ativo = false;        // dentro de uma fala
    this.quieto = 0;           // tempo abaixo do limiar dentro de uma fala
    this.dur = 0;
    this.pico = -100;
    this.somaZcr = 0; this.nZcr = 0;
    this.surdo = 0;            // segundos ignorando o microfone (enquanto os Polos falam)
    this.nivel = -100;         // último volume (para o medidor na tela)
  }

  // Ignora o microfone por um tempo (o som do próprio jogo não pode virar "Marco").
  tapaOuvidos(seg) { this.surdo = Math.max(this.surdo, seg); }

  // Processa um pedaço de som. Devolve null ou { tipo: 'grito'|'fala'|'sussurro', dur, pico }.
  processa(amostras) {
    const n = amostras.length;
    const dt = n / this.taxa;
    let s = 0, cruz = 0;
    for (let i = 0; i < n; i++) {
      const v = amostras[i];
      s += v * v;
      if (i > 0 && (v >= 0) !== (amostras[i - 1] >= 0)) cruz++;
    }
    const nivel = db(Math.sqrt(s / n));
    const zcr = cruz / n;
    this.nivel = nivel;
    if (this.surdo > 0) { this.surdo -= dt; this.ativo = false; return null; }

    // aprende o fundo devagar quando está quieto (desce rápido, sobe devagar)
    if (!this.ativo) this.fundo = nivel < this.fundo ? this.fundo + (nivel - this.fundo) * 0.3 : this.fundo + (nivel - this.fundo) * 0.01;
    const liga = this.fundo + 12, desliga = this.fundo + 7;

    if (!this.ativo) {
      if (nivel > liga) { this.ativo = true; this.dur = dt; this.pico = nivel; this.quieto = 0; this.somaZcr = zcr; this.nZcr = 1; }
      return null;
    }
    this.dur += dt;
    if (nivel > desliga) { this.quieto = 0; this.pico = Math.max(this.pico, nivel); this.somaZcr += zcr; this.nZcr++; }
    else this.quieto += dt;
    if (this.quieto < 0.18 && this.dur < 2.5) return null;

    // terminou
    this.ativo = false;
    const dur = this.dur - this.quieto;
    if (dur < 0.12 || dur > 2.4) return null;              // estalo ou barulho comprido
    const acima = this.pico - this.fundo;
    const aspero = this.somaZcr / this.nZcr;
    let tipo;
    if (acima < 22 || aspero > 0.28) tipo = 'sussurro';
    else if (this.pico > -20 && acima > 32) tipo = 'grito';
    else tipo = 'fala';
    return { tipo, dur, pico: this.pico, acima, aspero };
  }
}
