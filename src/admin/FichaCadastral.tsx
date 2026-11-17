import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, useToast, iniciais } from './AdminApp';
import { IconCheck, IconDownload, IconLink, IconX } from '../components/icons';
import { rotuloPapel } from './papeis';
import { tempoRelativo } from '../lib/datas';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { SECOES, exportarFicha, paraTela, valorLegivel, type Cadastro, type FormatoFicha } from '../lib/cadastro';

// ─────────────────────────────────────────────────────────────────────────────
//  A ficha cadastral de uma pessoa, aberta pela tela de Usuários: o que ela
//  preencheu no próprio Perfil, para ler, exportar e mandar o link adiante.
//  Só leitura - quem corrige o cadastro é a própria pessoa, no Perfil.
//
//  O link copiado é `?usuario=<id>`: abre o portal na tela de Usuários com esta
//  ficha aberta, e só para quem já alcança a tela (o servidor recusa o resto).
// ─────────────────────────────────────────────────────────────────────────────

export interface PessoaResumo {
  id: string;
  nome: string;
  email: string;
  foto_url: string | null;
  papel: string;
}

interface Resposta {
  usuario: PessoaResumo;
  cadastro: Record<string, string>;
  atualizado_em: string | null;
}

export function FichaCadastral({ token, pessoa, onFechar }: {
  token: string;
  /** O que a lista já sabe, para o cabeçalho nascer pronto enquanto a ficha chega. */
  pessoa: PessoaResumo;
  onFechar: () => void;
}) {
  const { onSessionExpired } = useAuth();
  const { toast } = useToast();
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);
  const [ficha, setFicha] = useState<{ cadastro: Cadastro; atualizadoEm: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [semFoto, setSemFoto] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/admin-data?action=usuario_cadastro&id=${encodeURIComponent(pessoa.id)}`,
      { headers: { 'x-admin-session': token } })
      .then(async r => {
        if (r.status === 401) { onSessionExpired(); return; }
        const d: Resposta & { error?: string } = await r.json().catch(() => ({}) as never);
        if (!vivo) return;
        if (!r.ok) { setErro(d?.error ?? 'A ficha não veio. Tente de novo.'); return; }
        setFicha({ cadastro: paraTela(d.cadastro), atualizadoEm: d.atualizado_em });
      })
      .catch(() => { if (vivo) setErro('A ficha não veio. Tente de novo.'); });
    return () => { vivo = false; };
  }, [token, pessoa.id, onSessionExpired]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fechar]);

  async function copiarLink() {
    const url = `${window.location.origin}${window.location.pathname}?usuario=${pessoa.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
      toast('success', 'Link copiado', 'Abre esta ficha para quem tem acesso à tela de Usuários.');
    } catch {
      toast('error', 'O navegador não deixou copiar', url);
    }
  }

  function exportar(formato: FormatoFicha) {
    if (!ficha) return;
    exportarFicha(formato, { nome: pessoa.nome, email: pessoa.email, papel: rotuloPapel(pessoa.papel) },
      ficha.cadastro, ficha.atualizadoEm);
  }

  const preenchidos = ficha
    ? SECOES.flatMap(s => s.campos).filter(([c]) => ficha.cadastro[c].trim()).length
    : 0;
  const total = SECOES.reduce((n, s) => n + s.campos.length, 0);

  return createPortal(
    <div className={`admin-modal-overlay tarefa-central-fundo${saindo ? ' saindo' : ''}`} {...fundo}>
      <div className="admin-modal painel-gaveta tarefa-central ficha-central"
        role="dialog" aria-modal="true" aria-label={`Ficha cadastral de ${pessoa.nome}`}
        onClick={e => e.stopPropagation()}>

        <div className="admin-modal-header">
          <div className="ficha-cabeca">
            <span className="ficha-avatar">
              {pessoa.foto_url && !semFoto
                ? <img src={pessoa.foto_url} alt="" referrerPolicy="no-referrer" onError={() => setSemFoto(true)} />
                : iniciais(pessoa.nome)}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="painel-rotulo">Ficha cadastral</p>
              <h3 className="ficha-nome">{ficha?.cadastro.nome_completo || pessoa.nome}</h3>
              <p className="ficha-sub">
                {pessoa.email}
                <span className="perfil-chip">{rotuloPapel(pessoa.papel)}</span>
              </p>
            </div>
          </div>
          <button type="button" className="admin-modal-close" aria-label="Fechar" onClick={fechar}>
            <IconX size={16} />
          </button>
        </div>

        <div className="admin-modal-body">
          {erro ? (
            <p className="ficha-aviso troca">{erro}</p>
          ) : !ficha ? (
            <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
          ) : (
            <div className="ficha-conteudo troca">
              <div className="ficha-situacao">
                <span>
                  {ficha.atualizadoEm
                    ? <>Atualizada pela pessoa {tempoRelativo(ficha.atualizadoEm)}</>
                    : <>Esta pessoa ainda não preencheu o cadastro no Perfil.</>}
                </span>
                <span className="ficha-situacao-conta">{preenchidos} de {total} campos</span>
              </div>
              {SECOES.map(s => (
                <section key={s.titulo} className="ficha-secao">
                  <h4 className="ficha-secao-titulo">{s.titulo}</h4>
                  <dl className="ficha-campos">
                    {s.campos.map(([campo, rotulo]) => {
                      const valor = valorLegivel(ficha.cadastro, campo);
                      return (
                        <div key={campo} className="ficha-campo">
                          <dt>{rotulo}</dt>
                          <dd className={valor ? undefined : 'vazio'}>{valor || 'Não informado'}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="painel-rodape ficha-rodape">
          <button type="button" className={`btn btn-secondary btn-sm${copiado ? ' ficha-copiado' : ''}`}
            onClick={() => void copiarLink()}>
            {copiado ? <IconCheck size={13} /> : <IconLink size={13} />} Copiar link
          </button>
          <span className="ficha-rodape-rotulo">Exportar</span>
          {([['pdf', 'PDF'], ['xlsx', 'Excel'], ['csv', 'CSV']] as const).map(([f, rotulo]) => (
            <button key={f} type="button" className="btn btn-secondary btn-sm" disabled={!ficha}
              onClick={() => exportar(f)}>
              <IconDownload size={13} /> {rotulo}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
