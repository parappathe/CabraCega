# CabraCega

**Cabra-Cega: Marco... Polo!** Jogo de realidade mista para o Meta Quest 3 no navegador (WebXR).
É a brincadeira de Marco Polo, de olhos "fechados", na sua sala de verdade e com a sua voz. A
câmera do Quest mostra a sala bem escurecida (a venda) e os **Polos**, bichinhos de luz
invisíveis, se escondem nos seus móveis. Você grita "Marco!" no microfone, cada Polo responde
"Polo!" em áudio 3D de onde está, e você vai até lá e pega com a mão. Também joga no PC (sala
virtual). Feito como protótipo da ideia; se o Eduardo aprovar, pode virar versão Unity.

## Como rodar / jogar

**No Quest:** abrir **https://parappathe.github.io/CabraCega/** no navegador do óculos, aceitar o
microfone e apertar "Entrar (realidade mista)". Para usar os móveis de verdade, a sala precisa
estar configurada no Quest (Configurações > Limites/Espaço físico); sem isso o jogo usa uma área
de 3 x 3 m à sua frente.

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8770` (painel de visualização:
`.claude/launch.json`). `?mudo` no endereço nunca liga o som (usado nos testes automáticos).

### Controles

| | Quest com controles | Quest só com as mãos | PC |
|---|---|---|---|
| "Marco!" | Falar no microfone, ou A/X | Falar, ou pinça (sem microfone) | Microfone, ou M (G grita, N sussurra) |
| Pegar | Encostar o controle no Polo | Encostar a mão (pontas dos dedos ou palma) | Clique (a mão avança no olhar) |
| Espiar (3 por fase) | B/Y | As duas mãos na frente dos olhos | E |
| Pausa | Apertar o direcional | Abrir o menu do Quest | Esc |
| Andar | Andando de verdade | Andando de verdade | WASD, mouse olha, C abaixa |

Quente ou frio: o controle vibra mais forte e mais rápido perto de um Polo; com as mãos, um
batimento de coração sai da mão. Paredes ficam vermelhas e apitam quando você chega a 40 cm.
F8 no PC: o robô mostra uma solução.

### Fases (`js/jogo.js`)

1. **Primeiro Polo**: um parado.
2. **Andarilhos**: três passeando.
3. **O Tímido**: só responde a sussurro; foge do grito.
4. **O Papagaio**: a voz vem do lado oposto de você.
5. **Os Escondidos**: debaixo da mesa, atrás do sofá, nos cantos.
6. **O Ligeiro**: corre quando ouve e só responde quando para.
7. **O Ventríloquo**: cada voz vem de dois lugares; o falso some ao toque.
8. **Mestre Polo-Rei**: vira três filhotes ligeiros.

Estrelas: terminar, usar até a meta de "Marco" e não espiar. Progresso salvo no navegador
(localStorage, chave `cabracega.v1`).

## Como testar

- `node tests/run.js` (ou `npm test`), sempre **sem som**. Testa:
  - sala padrão e sala montada a partir de planos do Quest;
  - detector de voz com sinais sintéticos (grito, fala, sussurro, silêncio, estalo, ouvidos tapados);
  - comportamento de cada Polo;
  - o robô (`tests/robo.js`) pega todos os Polos das 8 fases nas duas salas.
- Navegador: abrir com `?mudo` e usar o console: `cc.comecaFase(1); await cc.ligaRobo(); cc.avanca(10)`.
  Nunca clicar na página nos testes automáticos (o clique liga o som).
- **Só no óculos:**
  - microfone dentro da sessão imersiva;
  - mapa da sala (planos);
  - escurecimento da passagem da câmera;
  - precisão do áudio 3D;
  - vibração;
  - gesto de espiar;
  - segurança andando.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `js/sala.js` | Sala a partir dos planos do Quest ou padrão; paredes, móveis, esconderijos, `livre`, `espelho`. Sem navegador |
| `js/voz.js` | `DetectorVoz`: grito / fala / sussurro pelo volume e pela aspereza do som (sem reconhecer palavras). Sem navegador |
| `js/jogo.js` | As 8 fases e a `Rodada` (Polos, respostas, pegar, espiar, estrelas). Sem navegador |
| `js/audio.js` | Voz "Po-lo!" sintetizada por formantes (tom diferente por Polo), áudio 3D HRTF, efeitos. Sem música, de propósito |
| `js/main.js` | Sessão XR (realidade mista, senão VR, senão PC), planos, microfone, mãos, vibração, ecos, venda, menus, modo PC |
| `js/ui.js` | Painel de menu 3D (o mesmo do TeatroSombras, com cores próprias) |
| `tests/run.js`, `tests/robo.js` | Testes e o robô |
| `serve.py`, `vendor/three` | Servidor local sem cache; Three.js r170 |

Coordenadas: metros, y para cima, o jogador começa em (0, 0, 0) olhando para -z (`local-floor`).

## Regras e convenções do projeto

- `sala.js`, `voz.js` e `jogo.js` não usam navegador: os testes rodam no Node.
- Mexeu em Polos, fases ou detector de voz: rodar `node tests/run.js`.
- O som do próprio jogo não pode virar "Marco": o detector fica surdo enquanto um Polo fala
  (`tapaOuvidos`) e o microfone pede cancelamento de eco.

## Decisões

- Ideia minha a pedido do Eduardo ("jogo de VR nunca visto, usando todos os recursos do Quest"):
  Marco Polo / cabra-cega em realidade mista, com voz, áudio 3D, mapa da sala, mãos e vibração.
- Protótipo no navegador primeiro (gráfico simples, ideia forte), mesmo caminho do TeatroSombras.
- Malha da sala (`mesh-detection`) é experimental no navegador do Quest: usar só planos.
- Microfone dentro da sessão imersiva não tem documentação oficial da Meta: por isso "Marco"
  também funciona por botão ou pinça.
- O detector não reconhece palavras: qualquer fala vale "Marco". O que importa é se foi grito,
  fala ou sussurro.
- Papagaio: a voz vem do lado oposto ao jogador, uma regra que dá para deduzir de ouvido.
- Ligeiro: só responde depois de parar de correr (para dar para achar pelo som).

## Pendências / problemas conhecidos

- Nada testado no Quest ainda:
  - microfone na sessão;
  - limiares de grito/sussurro com a voz real (calibram sozinhos pelo ruído de fundo, mas podem precisar de ajuste);
  - planos da sala;
  - escurecimento da passagem da câmera;
  - gesto de espiar.
- Sem mapa da sala, a área padrão de 3 x 3 m pode não caber na sala real: confiar nos limites
  do Quest e no aviso vermelho das paredes.
