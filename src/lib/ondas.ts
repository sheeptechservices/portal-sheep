// ─────────────────────────────────────────────────────────────────────────────
//  Ondas em WebGL - o fundo animado da casa.
//
//  Nasceu na tela de entrada e saiu de lá quando o cartão de reportar, no menu,
//  passou a querer o mesmo movimento. As duas usam o MESMO shader: se o desenho
//  divergisse, seriam duas identidades visuais parecidas em vez de uma.
//
//  O que muda entre elas são as opções. Um palco de tela cheia e um cartão de
//  190 pixels não têm o mesmo orçamento: no cartão a versão é reduzida - menos
//  camadas no laço e taxa de quadros pela metade -, e nesse tamanho a diferença
//  de desenho não aparece, só a de custo.
//
//  A animação é cíclica por construção: `periodoDe` devolve o instante em que
//  todos os termos do shader fecham voltas inteiras ao mesmo tempo, e o relógio
//  reinicia ali. Isso dá o loop sem emenda e, de quebra, impede o `float` de
//  perder precisão numa aba deixada aberta a noite toda - passadas algumas
//  horas de segundos crus, o seno se repete em degraus e a onda empastela.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcoesOndas {
  /** Quão rápido a onda anda. */
  velocidade?: number;
  /** Peso do teal aceso sobre o cinza-azulado do fundo. */
  brilho?: number;
  /**
   * Camadas de deformação do laço. Cada uma é uma ida de seno e cosseno por
   * pixel, então é aqui que se compra ou se economiza detalhe. Seis é o desenho
   * do palco; quatro é indistinguível num cartão pequeno.
   */
  camadas?: number;
  /** Teto da densidade de pixel. */
  dprMax?: number;
  /** Teto de quadros por segundo. 0 usa o do monitor. */
  fps?: number;
}

export interface Ondas {
  parar(): void;
  /** Contexto perdido ou quadros travados: o vigia usa isto para remontar. */
  morto(): boolean;
}

/**
 * Shader das ondas, porte fiel do template: deforma o plano com uma soma de
 * senos e cossenos realimentada e tira dali o brilho e a banda em teal.
 *
 * O número de camadas entra no código-fonte, e não como uniform, porque WebGL 1
 * exige limite constante em laço - trocar isso em tempo de execução obrigaria a
 * recompilar o programa, que é justamente o que se quer evitar.
 */
const fragOndas = (camadas: number) => `
precision highp float;
uniform vec2 u_res; uniform float u_time; uniform float u_speed; uniform float u_warm;
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*u_res) / min(u_res.x, u_res.y);
  float t = u_time * u_speed;
  vec2 q = uv * 1.6;
  for (float i = 1.; i < ${(camadas + 1).toFixed(1)}; i++) {
    q.x += (0.42/i) * sin(i*2.1*q.y + t + i*1.7) ;
    q.y += (0.46/i) * cos(i*1.6*q.x + t*1.13 + i*0.8);
  }
  float v = sin(q.x*1.2 + q.y*1.1 + t*0.3);
  float s = 0.5 + 0.5*v;
  float sheen = pow(s, 6.0);
  float mid = pow(s, 2.2);
  float gold = pow(0.5 + 0.5*sin(q.x*0.9 - q.y*1.3 + t*0.5), 3.0);
  vec3 base = vec3(0.016, 0.018, 0.026);
  vec3 midC = mix(vec3(0.020, 0.080, 0.068), vec3(0.035, 0.150, 0.125), gold*u_warm);
  vec3 hi   = mix(vec3(0.10, 0.82, 0.68), vec3(0.25, 0.92, 0.80), gold*u_warm);
  vec3 col = base + midC*mid + hi*sheen*0.85;
  col += vec3(0.05, 0.72, 0.60) * gold * mid * sheen * 0.5 * u_warm;
  float vig = smoothstep(1.45, 0.35, length(uv));
  col *= 0.55 + 0.45*vig;
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT_ONDAS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

export const ONDAS_VELOCIDADE = 0.28;
export const ONDAS_BRILHO = 1.0;

/**
 * Onde o ciclo fecha, em segundos de shader. Os termos que dependem do tempo
 * são t, 1.13t, 0.3t e 0.5t; a cada t = 200π os quatro completam voltas
 * inteiras de 2π juntos, então reiniciar o relógio aí devolve exatamente a
 * mesma imagem, sem salto.
 */
export const periodoDe = (velocidade: number) => (200 * Math.PI) / velocidade;

/**
 * Monta as ondas no canvas. Devolve null quando o contexto não pôde ser criado
 * - nesse caso quem chamou fica com o degradê do CSS, que sozinho já é um fundo
 * apresentável.
 */
export function iniciarOndas(canvas: HTMLCanvasElement, opcoes: OpcoesOndas = {}): Ondas | null {
  const velocidade = opcoes.velocidade ?? ONDAS_VELOCIDADE;
  const brilho = opcoes.brilho ?? ONDAS_BRILHO;
  const camadas = opcoes.camadas ?? 6;
  const dprMax = opcoes.dprMax ?? 2;
  const intervalo = opcoes.fps ? 1000 / opcoes.fps : 0;
  const periodo = periodoDe(velocidade);

  const gl = canvas.getContext('webgl', { antialias: true, powerPreference: 'low-power' });
  if (!gl || gl.isContextLost()) return null;

  const compilar = (tipo: number, fonte: string) => {
    const sh = gl.createShader(tipo)!;
    gl.shaderSource(sh, fonte);
    gl.compileShader(sh);
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compilar(gl.VERTEX_SHADER, VERT_ONDAS));
  gl.attachShader(prog, compilar(gl.FRAGMENT_SHADER, fragOndas(camadas)));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  // Um triângulo só, maior que a tela: mais barato que dois para um fundo.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uSpeed = gl.getUniformLocation(prog, 'u_speed');
  const uWarm = gl.getUniformLocation(prog, 'u_warm');

  const redimensionar = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, dprMax);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };
  window.addEventListener('resize', redimensionar);

  let raf = 0;
  // Dois relógios de propósito: `ultimoTique` marca o rAF e é o que diz se a
  // animação travou; `ultimoDesenho` marca o quadro que de fato foi desenhado e
  // é o que o teto de fps consulta. Com um só, limitar os quadros pareceria
  // travamento para o vigia.
  let ultimoTique = performance.now();
  let ultimoDesenho = 0;
  const inicio = ultimoTique;

  const quadro = () => {
    if (gl.isContextLost()) return;
    const agora = performance.now();
    ultimoTique = agora;
    raf = requestAnimationFrame(quadro);
    if (intervalo && agora - ultimoDesenho < intervalo) return;
    ultimoDesenho = agora;
    redimensionar();
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, ((agora - inicio) / 1000) % periodo);
    gl.uniform1f(uSpeed, velocidade);
    gl.uniform1f(uWarm, brilho);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const perdeu = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); };
  canvas.addEventListener('webglcontextlost', perdeu);
  quadro();

  return {
    parar() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', redimensionar);
      canvas.removeEventListener('webglcontextlost', perdeu);
      // Nada de WEBGL_lose_context aqui: um canvas com contexto perdido devolve
      // o MESMO contexto morto no getContext seguinte, e sob StrictMode (que
      // monta, limpa e remonta) as ondas nunca mais subiriam. Quem libera a GPU
      // é o navegador, quando o elemento é coletado.
    },
    morto: () => gl.isContextLost() || performance.now() - ultimoTique > 3000,
  };
}
