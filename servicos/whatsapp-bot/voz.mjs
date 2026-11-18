// ─────────────────────────────────────────────────────────────────────────────
//  Texto em mensagem de voz, na própria máquina: o Kokoro (`falar.py`), de
//  licença livre, rodando no processador da VPS. Sem internet, sem chave e
//  sem custo. É usado só quando a pessoa pede a resposta em áudio.
//
//  O Kokoro devolve WAV; o ffmpeg passa para OGG/Opus, que é o formato da
//  mensagem de voz do WhatsApp, e a Evolution manda como tal, sem converter de
//  novo.
//
//  Um áudio por vez, como a transcrição: a fala leva mais que o próprio áudio
//  para sair (uns 15 segundos para 12 de fala, em dois processadores).
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const PYTHON = process.env.KOKORO_PYTHON || '/opt/kokoro/bin/python';
const SCRIPT = process.env.KOKORO_SCRIPT || fileURLToPath(new URL('./falar.py', import.meta.url));
const VOZ = process.env.KOKORO_VOZ || 'pm_alex';
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
/** O texto mais longo que vira áudio: cerca de um minuto e pouco de fala, que
 *  já leva mais de um minuto para gerar. Acima disso vai por escrito. */
export const FALA_MAX_CARACTERES = Number(process.env.FALA_MAX_CARACTERES || 1200);
const TEMPO_MAX_MS = Number(process.env.FALA_TEMPO_MAX_MS || 240_000);

/** Falha que pode ir para o log como está. */
export class ErroFala extends Error {}

function rodar(exe, args, { entrada, tempoMs }) {
  return new Promise((resolver, rejeitar) => {
    // Um `.mjs` no lugar do executável roda pelo próprio Node: é como os testes
    // trocam o Python e o ffmpeg por dublês.
    const [prog, antes] = exe.endsWith('.mjs') ? [process.execPath, [exe]] : [exe, []];
    const filho = spawn(prog, [...antes, ...args], { stdio: ['pipe', 'ignore', 'pipe'] });
    let erro = '';
    const relogio = setTimeout(() => filho.kill('SIGKILL'), tempoMs);
    filho.stderr.on('data', c => { erro += c; });
    filho.on('error', e => {
      clearTimeout(relogio);
      rejeitar(new ErroFala(e.code === 'ENOENT' ? `o ${exe} não está instalado` : e.message));
    });
    filho.on('close', (codigo, sinal) => {
      clearTimeout(relogio);
      if (sinal === 'SIGKILL') return rejeitar(new ErroFala('a fala demorou demais'));
      if (codigo !== 0) return rejeitar(new ErroFala(`${exe} falhou: ${erro.trim().split('\n').pop()?.slice(0, 160) ?? codigo}`));
      resolver();
    });
    filho.stdin.end(entrada ?? '');
  });
}

let fila = Promise.resolve();

/** Gera a mensagem de voz do texto e devolve o OGG/Opus. `pasta` guarda os
 *  arquivos de passagem, apagados no fim. */
export function falar(texto, pasta) {
  const vez = fila.then(() => falarAgora(texto, pasta));
  fila = vez.catch(() => {});
  return vez;
}

async function falarAgora(texto, pasta) {
  const limpo = String(texto ?? '').trim();
  if (!limpo) throw new ErroFala('texto vazio');
  if (limpo.length > FALA_MAX_CARACTERES) throw new ErroFala('texto longo demais para áudio');
  const base = join(pasta, `fala-${Date.now()}-${randomBytes(4).toString('hex')}`);
  const wav = `${base}.wav`;
  const ogg = `${base}.ogg`;
  try {
    await rodar(PYTHON, [SCRIPT, '--voz', VOZ, '--saida', wav], { entrada: limpo, tempoMs: TEMPO_MAX_MS });
    await rodar(FFMPEG, ['-nostdin', '-loglevel', 'error', '-i', wav, '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-y', ogg], { tempoMs: 60_000 });
    return readFileSync(ogg);
  } finally {
    for (const f of [wav, ogg]) { try { unlinkSync(f); } catch { /* já foi */ } }
  }
}

/** O texto da resposta do jeito que se fala: sem as marcas do WhatsApp, sem
 *  marcador de lista e sem link, que lido em voz alta vira ruído. */
export function paraFala(texto) {
  return String(texto ?? '')
    // A pontuação logo depois do link fica: ela é da frase, não do endereço.
    .replace(/https?:\/\/\S+?(?=[.,;:!?)\]]*(?:\s|$))/g, 'o link')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/[*_~`#]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
