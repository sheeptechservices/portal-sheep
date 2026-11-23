// ─────────────────────────────────────────────────────────────────────────────
//  A versão nova do portal, avisada e nunca imposta.
//
//  Cada deploy grava o número dele no código (`__VERSAO_DO_PORTAL__`) e num
//  arquivo à parte (`/versao.json`). A aba aberta confere o arquivo de tempos
//  em tempos e quando volta a ficar à vista; se o número mudou, acende o
//  aviso, e quem decide a hora de atualizar é a pessoa: pelo botão do aviso
//  ou pelo F5. Recarregar sozinho jogaria fora o que ela estiver escrevendo.
//
//  A outra metade é a tela que não carrega. As telas descem sob demanda, e
//  depois de um deploy os arquivos da versão anterior deixam de existir: na
//  aba antiga, abrir uma tela que ainda não tinha descido falhava e derrubava
//  o portal inteiro numa tela branca. `telaSobDemanda` segura essa falha: só
//  aquela área mostra o pedido de atualizar, e o resto continua de pé.
// ─────────────────────────────────────────────────────────────────────────────
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { IconRefresh } from '../components/icons';

/** A versão que está rodando nesta aba. */
export const VERSAO_ATUAL = __VERSAO_DO_PORTAL__;

/** De quanto em quanto tempo a aba confere se saiu versão nova. */
const INTERVALO_MS = 5 * 60_000;
/** O mínimo entre duas conferências: a aba volta à vista toda hora. */
const FOLGA_MS = 60_000;

export interface EstadoDaVersao {
  /** Saiu versão nova e a aba ainda roda a anterior. */
  nova: boolean;
  /** Uma tela não carregou por causa disso: atualizar deixa de ser opcional
   *  para abri-la. */
  telaQuebrou: boolean;
}

let estado: EstadoDaVersao = { nova: false, telaQuebrou: false };
const ouvintes = new Set<() => void>();

function mudar(parte: Partial<EstadoDaVersao>) {
  estado = { ...estado, ...parte };
  for (const o of ouvintes) o();
}

export function assinarVersao(o: () => void): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}
export const estadoDaVersao = () => estado;

let ultimaConferencia = 0;

/** Pergunta ao servidor qual versão está no ar. Falhar (sem rede, deploy no
 *  meio) não acende nada: a próxima conferência tenta de novo. */
export async function conferirVersao(): Promise<void> {
  if (estado.nova) return;
  ultimaConferencia = Date.now();
  try {
    const r = await fetch(`/versao.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { versao } = await r.json() as { versao?: string };
    if (versao && versao !== VERSAO_ATUAL) mudar({ nova: true });
  } catch {
    /* tenta na próxima */
  }
}

let iniciado = false;

/** Liga a conferência: no intervalo e quando a aba volta à vista. Só na
 *  versão publicada; no `npm run dev` o código já troca sozinho. */
export function vigiarVersao(): void {
  if (iniciado || !import.meta.env.PROD) return;
  iniciado = true;
  const talvez = () => { if (Date.now() - ultimaConferencia > FOLGA_MS) void conferirVersao(); };
  window.setInterval(() => void conferirVersao(), INTERVALO_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') talvez(); });
  window.addEventListener('focus', talvez);
  // O pré-carregamento do Vite também acusa arquivo que sumiu.
  window.addEventListener('vite:preloadError', () => mudar({ nova: true }));
  void conferirVersao();
}

/** Atualiza a página. Só por pedido da pessoa. */
export function atualizarAgora(): void {
  window.location.reload();
}

/**
 * Uma tela carregada sob demanda, que não derruba o portal se o arquivo dela
 * sumiu num deploy. Tenta duas vezes (pode ser só a rede); falhando, acende o
 * aviso e devolve, no lugar da tela, o pedido de atualizar.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function telaSobDemanda<T extends ComponentType<any>>(
  carregar: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await carregar();
    } catch {
      try {
        return await carregar();
      } catch {
        mudar({ nova: true, telaQuebrou: true });
        return { default: TelaDesatualizada as unknown as T };
      }
    }
  });
}

/** O que aparece no lugar da tela que não carregou: só aquela área, com o
 *  motivo e o botão. O que a pessoa tiver aberto em outra parte fica onde está. */
function TelaDesatualizada() {
  return (
    <div className="tela-desatualizada surge" role="alert">
      <span className="tela-desatualizada-ico"><IconRefresh size={22} /></span>
      <p className="tela-desatualizada-titulo">Esta tela mudou na versão nova do portal</p>
      <p className="tela-desatualizada-texto">
        Para abri-la, atualize a página. Antes, termine o que estiver fazendo em outra parte: atualizar recarrega
        o portal inteiro.
      </p>
      <button type="button" className="btn btn-primary btn-sm" onClick={atualizarAgora}>
        <IconRefresh size={13} /> Atualizar agora
      </button>
    </div>
  );
}
