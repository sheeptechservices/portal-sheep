import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth, useToast } from './AdminApp';
import { IconAlert, IconChevronDown, IconSpinner } from '../components/icons';
import { PAPEL_LABEL } from './papeis';
import { instante as formatarData } from '../lib/datas';

// ─────────────────────────────────────────────────────────────────────────────
//  Matriz de permissões do papel Membro: por página e por ação, marcando e
//  desmarcando o que ele pode acessar e fazer em cada lugar.
//
//  Os checkboxes vêm do catálogo que o servidor manda (`api/_permissoes.ts`), e
//  não de uma cópia local. Isso não é preciosismo: garante que não exista
//  checkbox sem permissão real por trás nem permissão sem checkbox, e faz uma
//  permissão nova aparecer aqui sozinha, sem mexer nesta tela.
//
//  Master e Admin não têm matriz: fazem tudo por definição.
// ─────────────────────────────────────────────────────────────────────────────

interface PermAcao {
  chave: string;
  label: string;
  nota?: string;
  acesso?: boolean;
  apenasUi?: boolean;
}

interface PermGrupo {
  chave: string;
  label: string;
  nota?: string;
  page?: string;
  /** Grupo que abriga este na tela - as ferramentas vêm dentro do hub. */
  dentroDe?: string;
  acoes: PermAcao[];
}

interface Resposta {
  catalogo?: PermGrupo[];
  concedidas?: string[];
  configurado?: boolean;
  atualizado_em?: string | null;
  atualizado_por_nome?: string | null;
  error?: string;
}

export default function MatrizPermissoes({ token }: { token: string }) {
  const { onSessionExpired } = useAuth();
  const { toast } = useToast();
  const [catalogo, setCatalogo] = useState<PermGrupo[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  /** Retrato do que está salvo, para saber se há mudança pendente. */
  const [salvas, setSalvas] = useState<Set<string>>(new Set());
  const [configurado, setConfigurado] = useState(false);
  const [meta, setMeta] = useState<{ em: string | null; por: string | null }>({ em: null, por: null });
  /**
   * Locais abertos na tela. Todos começam recolhidos: são onze locais e quase
   * setenta ações, e mostrar tudo de uma vez vira um paredão de quadradinhos
   * marcados onde não se acha nada. Quem vem aqui quer mexer em um local.
   */
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setFalhou(false);
    try {
      const r = await fetch('/api/admin-data?action=permissoes', { headers: { 'x-admin-session': token } });
      if (r.status === 401) { onSessionExpired(); return; }
      if (!r.ok) { setFalhou(true); return; }
      const d: Resposta = await r.json();
      const concedidas = new Set(d.concedidas ?? []);
      setCatalogo(d.catalogo ?? []);
      setMarcadas(concedidas);
      setSalvas(new Set(concedidas));
      setConfigurado(!!d.configurado);
      setMeta({ em: d.atualizado_em ?? null, por: d.atualizado_por_nome ?? null });
    } catch {
      setFalhou(true);
    } finally {
      setCarregando(false);
    }
  }, [token, onSessionExpired]);

  useEffect(() => { void carregar(); }, [carregar]);

  const todas = useMemo(
    () => (catalogo ?? []).flatMap(g => g.acoes.map(a => a.chave)),
    [catalogo],
  );

  /**
   * Árvore de exibição. O catálogo continua achatado - é assim que ele vale como
   * fonte das permissões -, e o `dentroDe` só diz quem mora dentro de quem na
   * tela: as quatro ferramentas aparecem aninhadas no hub, como no menu.
   */
  const { raizes, filhosDe } = useMemo(() => {
    const filhos = new Map<string, PermGrupo[]>();
    const topo: PermGrupo[] = [];
    for (const g of catalogo ?? []) {
      if (!g.dentroDe) { topo.push(g); continue; }
      filhos.set(g.dentroDe, [...(filhos.get(g.dentroDe) ?? []), g]);
    }
    return { raizes: topo, filhosDe: filhos };
  }, [catalogo]);

  // Mudou algo desde o último salvamento? Compara conteúdo, não referência: o
  // botão só acende quando há de fato o que gravar.
  const sujo = useMemo(() => {
    if (marcadas.size !== salvas.size) return true;
    for (const c of marcadas) if (!salvas.has(c)) return true;
    return false;
  }, [marcadas, salvas]);

  function expandir(chave: string) {
    setExpandidos(prev => {
      const proximo = new Set(prev);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  function alternar(chave: string) {
    setMarcadas(prev => {
      const proximo = new Set(prev);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  /**
   * Desmarcar o acesso ao local desmarca as ações dele junto. Sem isso ficaria
   * gravado "não pode entrar em Liquidez, mas pode excluir lançamento", que não
   * quer dizer nada - e, mais importante, cada ação é conferida por si no
   * servidor, então essa marcação órfã seria uma permissão de verdade.
   */
  function alternarGrupo(grupo: PermGrupo) {
    const acesso = grupo.acoes.find(a => a.acesso);
    if (!acesso) return;
    const ligando = !marcadas.has(acesso.chave);
    setMarcadas(prev => {
      const proximo = new Set(prev);
      if (ligando) proximo.add(acesso.chave);
      else for (const a of grupo.acoes) proximo.delete(a.chave);
      return proximo;
    });
  }

  function marcarTodas(valor: boolean) {
    setMarcadas(valor ? new Set(todas) : new Set());
  }

  async function salvar() {
    setSalvando(true);
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'set_permissoes_papel', papel: 'membro', chaves: [...marcadas] }),
      });
      if (r.status === 401) { onSessionExpired(); return; }
      const d: Resposta = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast('error', 'Não deu', d.error ?? 'As permissões não foram gravadas.');
        return;
      }
      setSalvas(new Set(d.concedidas ?? [...marcadas]));
      setConfigurado(true);
      setMeta({ em: d.atualizado_em ?? null, por: d.atualizado_por_nome ?? null });
      toast('success', 'Permissões salvas', `Vale para todo mundo que é ${PAPEL_LABEL.membro}.`);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <div className="dux-spinner-row" style={{ padding: '30px 0' }}><span className="dux-spinner sm" /></div>;
  }

  if (falhou || !catalogo) {
    return (
      <div className="perfil-cartao perfil-vazio">
        <IconAlert size={18} />
        <div>
          <p className="perfil-vazio-titulo">A matriz não carregou</p>
          <p className="perfil-vazio-texto">Nada foi alterado. Tente buscar de novo.</p>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  const total = todas.length;
  const ativas = todas.filter(c => marcadas.has(c)).length;

  return (
    <div className="perm-bloco">
      <div className="perm-barra">
        <div className="perm-barra-info">
          <p className="perm-barra-titulo">
            {ativas} de {total} permissões marcadas
          </p>
          <p className="perm-barra-sub">
            {!configurado ? (
              <>
                Nunca configurado: hoje {PAPEL_LABEL.membro} alcança tudo. O que você salvar aqui
                passa a valer no lugar disso.
              </>
            ) : meta.em ? (
              <>Última alteração em {formatarData(meta.em)}{meta.por ? ` por ${meta.por}` : ''}.</>
            ) : (
              <>Vale para todo mundo que é {PAPEL_LABEL.membro}.</>
            )}
          </p>
        </div>
        <div className="perm-barra-acoes">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => marcarTodas(true)} disabled={salvando}>
            Marcar tudo
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => marcarTodas(false)} disabled={salvando}>
            Desmarcar tudo
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void salvar()} disabled={salvando || !sujo}>
            {salvando ? <IconSpinner size={13} /> : sujo ? 'Salvar permissões' : 'Salvo'}
          </button>
        </div>
      </div>

      <div className="perm-lista">
        {raizes.map(g => desenharGrupo(g))}
      </div>
    </div>
  );

  /**
   * Um local e o que vive dentro dele: as ações próprias e, quando for o caso,
   * os locais aninhados (o hub e as suas ferramentas). É função e não componente
   * para não ter que repassar meia dúzia de estados por props - a recursão aqui
   * tem um nível só.
   */
  function desenharGrupo(grupo: PermGrupo, aninhado = false) {
    const acesso = grupo.acoes.find(a => a.acesso);
    const aberto = !acesso || marcadas.has(acesso.chave);
    const filhas = grupo.acoes.filter(a => !a.acesso);
    const netos = filhosDe.get(grupo.chave) ?? [];
    const expandido = expandidos.has(grupo.chave);
    const temConteudo = filhas.length > 0 || netos.length > 0;
    // O contador do hub conta a subárvore inteira: sozinho ele teria só o
    // "abrir", que não diz nada de quanto as ferramentas estão liberadas.
    const [marcadasAqui, totalAqui] = contar(grupo);

    return (
      <section
        key={grupo.chave}
        className={`perm-grupo${aberto ? '' : ' fechado'}${expandido ? ' expandido' : ''}${aninhado ? ' aninhado' : ''}`}
      >
        <div className="perm-cabeca">
          {/* Checkbox solto, sem <label> em volta do nome: com a linha
              recolhível, clicar no nome abre a lista, e só o quadradinho liga e
              desliga o acesso ao local. */}
          <input
            type="checkbox"
            className="perm-check"
            checked={aberto}
            disabled={salvando}
            aria-label={`Acesso a ${grupo.label}`}
            onChange={() => alternarGrupo(grupo)}
          />
          <button
            type="button"
            className="perm-cabeca-alvo"
            aria-expanded={expandido}
            disabled={!temConteudo}
            onClick={() => expandir(grupo.chave)}
          >
            <span className="perm-grupo-nome">{grupo.label}</span>
            {grupo.nota && <span className="perm-grupo-nota">{grupo.nota}</span>}
            {temConteudo && (
              <>
                <span className={`perm-contador${marcadasAqui < totalAqui ? ' parcial' : ''}`}>
                  {marcadasAqui}/{totalAqui}
                </span>
                <span className="perm-seta"><IconChevronDown size={13} /></span>
              </>
            )}
          </button>
        </div>

        {expandido && temConteudo && (
          <div className="perm-corpo">
            {filhas.length > 0 && (
              <div className="perm-acoes">
                {filhas.map(a => (
                  <label key={a.chave} className="perm-linha">
                    <input
                      type="checkbox"
                      className="perm-check"
                      checked={marcadas.has(a.chave)}
                      // Ação de um local fechado não é marcável: seria uma
                      // permissão sem a porta de entrada.
                      disabled={salvando || !aberto}
                      onChange={() => alternar(a.chave)}
                    />
                    <span className="perm-acao-nome">
                      {a.label}
                      {a.apenasUi && (
                        <span className="perm-tag" title="O servidor não impõe esta: desmarcar esconde o botão">
                          só na tela
                        </span>
                      )}
                    </span>
                    {a.nota && <span className="perm-acao-nota">{a.nota}</span>}
                  </label>
                ))}
              </div>
            )}
            {netos.length > 0 && (
              <div className="perm-aninhados">
                {netos.map(n => desenharGrupo(n, true))}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  /**
   * Marcadas e total da subárvore, sem contar o acesso do próprio grupo - esse
   * é o quadradinho ao lado do contador, e contá-lo seria dizer duas vezes a
   * mesma coisa.
   */
  function contar(grupo: PermGrupo): [number, number] {
    const chaves = [
      ...grupo.acoes.filter(a => !a.acesso).map(a => a.chave),
      ...(filhosDe.get(grupo.chave) ?? []).flatMap(f => f.acoes.map(a => a.chave)),
    ];
    return [chaves.filter(c => marcadas.has(c)).length, chaves.length];
  }
}
