// ─────────────────────────────────────────────────────────────────────────────
//  Áudio em texto, na própria máquina: o whisper.cpp rodando no processador da
//  VPS, sem internet e sem chave de API. É o que deixa o bot entender a
//  mensagem de voz sem custo nenhum: o Claude não ouve, então o áudio chega
//  nele já como texto.
//
//  O WhatsApp manda voz em OGG/Opus, que o whisper.cpp não lê: o ffmpeg passa
//  antes para WAV de 16 kHz, mono, que é o que o modelo espera.
//
//  Uma transcrição por vez: são dois processadores, que também atendem a
//  Evolution. Duas ao mesmo tempo levariam o dobro cada uma e travariam o resto.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const WHISPER = process.env.WHISPER_BIN || 'whisper-cli';
const MODELO = process.env.WHISPER_MODELO || '/opt/whisper/modelo.bin';
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const THREADS = String(process.env.WHISPER_THREADS || 2);
/** O áudio mais longo que se transcreve. Acima disso o servidor ficaria
 *  minutos ocupado com uma mensagem só. */
export const AUDIO_MAX_SEGUNDOS = Number(process.env.AUDIO_MAX_SEGUNDOS || 300);
const TEMPO_MAX_MS = Number(process.env.TRANSCRICAO_TEMPO_MAX_MS || 240_000);

/** Falha que pode ir para a pessoa como está. */
export class ErroTranscricao extends Error {}

function rodar(exe, args, tempoMs) {
  return new Promise((resolver, rejeitar) => {
    // Um `.mjs` no lugar do executável roda pelo próprio Node: é como os testes
    // trocam o ffmpeg e o whisper por dublês.
    const [prog, antes] = exe.endsWith('.mjs') ? [process.execPath, [exe]] : [exe, []];
    const filho = spawn(prog, [...antes, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    let erro = '';
    const relogio = setTimeout(() => filho.kill('SIGKILL'), tempoMs);
    filho.stdout.on('data', c => { saida += c; });
    filho.stderr.on('data', c => { erro += c; });
    filho.on('error', e => {
      clearTimeout(relogio);
      rejeitar(new ErroTranscricao(e.code === 'ENOENT' ? `o ${exe} não está instalado` : e.message));
    });
    filho.on('close', (codigo, sinal) => {
      clearTimeout(relogio);
      if (sinal === 'SIGKILL') return rejeitar(new ErroTranscricao('a transcrição demorou demais'));
      if (codigo !== 0) return rejeitar(new ErroTranscricao(`o ${exe} falhou: ${erro.trim().split('\n').pop()?.slice(0, 160) ?? codigo}`));
      resolver(saida);
    });
  });
}

let fila = Promise.resolve();

/** Transcreve o áudio (qualquer formato que o ffmpeg abra) e devolve o texto,
 *  já sem marcação de tempo. `pasta` é onde ficam os arquivos de passagem, que
 *  são apagados no fim. */
export function transcrever(conteudo, pasta) {
  const vez = fila.then(() => transcreverAgora(conteudo, pasta));
  // A fila anda mesmo se esta falhar.
  fila = vez.catch(() => {});
  return vez;
}

async function transcreverAgora(conteudo, pasta) {
  const base = join(pasta, `audio-${Date.now()}-${randomBytes(4).toString('hex')}`);
  const entrada = `${base}.in`;
  const wav = `${base}.wav`;
  writeFileSync(entrada, conteudo, { mode: 0o600 });
  try {
    await rodar(FFMPEG, ['-nostdin', '-loglevel', 'error', '-i', entrada, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', wav], 60_000);
    // -nt: sem marcação de tempo; -np: sem o relatório do modelo na saída.
    const saida = await rodar(WHISPER, ['-m', MODELO, '-l', 'pt', '-t', THREADS, '-nt', '-np', '-f', wav], TEMPO_MAX_MS);
    const texto = saida
      .split('\n')
      .map(l => l.replace(/^\s*\[[^\]]*\]\s*/, '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    // O modelo marca silêncio e música entre colchetes ou parênteses.
    if (!texto || /^[[(][^\])]*[\])]$/.test(texto)) throw new ErroTranscricao('não deu para entender nada no áudio');
    return texto;
  } finally {
    for (const f of [entrada, wav]) { try { unlinkSync(f); } catch { /* já foi */ } }
  }
}
