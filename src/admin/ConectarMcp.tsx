import { useEffect, useMemo, useRef, useState } from 'react';
import { IconAlert, IconBot, IconSpinner } from '../components/icons';

// ─────────────────────────────────────────────────────────────────────────────
//  Conectar IA - a tela de consentimento do OAuth do MCP.
//
//  O cliente MCP (Claude Code, claude.ai, Cursor) manda a pessoa para cá com o
//  pedido na query. Sem sessão, o portal mostra a entrada de sempre antes, e o
//  endereço fica o mesmo, então depois de entrar a pessoa cai aqui de novo.
//
//  Quem não tem o MCP ligado não vê esta tela: o servidor responde a ela como
//  a qualquer ação inexistente, e a tela só manda para o início do portal.
// ─────────────────────────────────────────────────────────────────────────────

interface Pedido {
  cliente: string;
  redirect_uri: string;
  state: string | null;
  conta: { nome: string; email: string };
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'pedido'; pedido: Pedido }
  | { tipo: 'erro'; mensagem: string };

export default function ConectarMcp({ token, onSessaoExpirada }: {
  token: string;
  onSessaoExpirada: () => void;
}) {
  // O pedido é o que veio na URL, inteiro: o servidor confere cada campo, e a
  // tela não escolhe o que repassar.
  const params = useMemo(() => Object.fromEntries(new URLSearchParams(window.location.search)), []);
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [enviando, setEnviando] = useState<'sim' | 'nao' | null>(null);
  // Em ref: quem passa a função a recria a cada render, e como dependência do
  // efeito ela faria o pedido ser conferido de novo a cada volta.
  const expirou = useRef(onSessaoExpirada);
  expirou.current = onSessaoExpirada;

  useEffect(() => {
    document.title = 'Conectar IA - Portal Sheep';
    let vivo = true;
    const qs = new URLSearchParams({ ...params, action: 'mcp_pedido' });
    fetch(`/api/admin-data?${qs}`, { headers: { 'x-admin-session': token } })
      .then(async r => {
        if (!vivo) return;
        if (r.status === 401) { expirou.current(); return; }
        const d = await r.json().catch(() => ({}));
        if (r.ok) { setEstado({ tipo: 'pedido', pedido: d as Pedido }); return; }
        // Pedido malformado é do cliente, e vale dizer. Qualquer outra recusa
        // é a de quem não tem o acesso: volta ao portal sem explicar nada.
        if (d?.oauth) { setEstado({ tipo: 'erro', mensagem: String(d.error) }); return; }
        window.location.replace('/');
      })
      .catch(() => { if (vivo) setEstado({ tipo: 'erro', mensagem: 'Sem conexão com o portal. Tente de novo.' }); });
    return () => { vivo = false; };
  }, [params, token]);

  async function conectar() {
    if (enviando) return;
    setEnviando('sim');
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'mcp_autorizar', pedido: params }),
      });
      if (r.status === 401) { expirou.current(); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.redirecionar) {
        setEnviando(null);
        setEstado({ tipo: 'erro', mensagem: String(d.error ?? 'Não foi possível conectar.') });
        return;
      }
      // O giro fica até a página trocar: quem clicou vê que está indo.
      window.location.assign(d.redirecionar);
    } catch {
      setEnviando(null);
      setEstado({ tipo: 'erro', mensagem: 'Sem conexão com o portal. Tente de novo.' });
    }
  }

  /** Cancelar também responde ao cliente, pelo endereço que o servidor já
   *  conferiu: sem isso ele ficaria esperando uma volta que não vem. */
  function recusar(p: Pedido) {
    if (enviando) return;
    setEnviando('nao');
    const volta = new URL(p.redirect_uri);
    volta.searchParams.set('error', 'access_denied');
    if (p.state) volta.searchParams.set('state', p.state);
    window.location.assign(volta.toString());
  }

  return (
    <div className="mcp-conectar">
      {estado.tipo === 'carregando' && (
        <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
      )}

      {estado.tipo === 'erro' && (
        <div className="mcp-conectar-cartao surge">
          <div className="mcp-conectar-icone erro"><IconAlert size={20} /></div>
          <p className="painel-rotulo">CONECTAR IA</p>
          <h1 className="mcp-conectar-titulo">Não deu para conectar</h1>
          <p className="mcp-conectar-texto">{estado.mensagem}</p>
          <p className="mcp-conectar-nota">Volte ao aplicativo de IA e comece a conexão de novo.</p>
        </div>
      )}

      {estado.tipo === 'pedido' && (
        <div className="mcp-conectar-cartao surge">
          <div className="mcp-conectar-icone"><IconBot size={20} /></div>
          <p className="painel-rotulo">CONECTAR IA</p>
          <h1 className="mcp-conectar-titulo">{estado.pedido.cliente} quer acessar o portal</h1>
          <p className="mcp-conectar-texto">
            Ao conectar, {estado.pedido.cliente} passa a ler e alterar as tarefas que você enxerga, em
            seu nome: listar, criar, editar, mover de etapa, comentar e anexar. Tudo sai assinado por
            você e respeita as suas permissões.
          </p>
          <div className="mcp-conectar-conta">
            <span className="mcp-conectar-conta-rotulo">Conta</span>
            <span className="mcp-conectar-conta-valor">
              {estado.pedido.conta.nome} <span>{estado.pedido.conta.email}</span>
            </span>
          </div>
          <div className="mcp-conectar-acoes">
            <button type="button" className="btn btn-secondary" disabled={!!enviando}
              onClick={() => recusar(estado.pedido)}>
              {enviando === 'nao' && <IconSpinner size={13} />}
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" disabled={!!enviando}
              onClick={() => void conectar()}>
              {enviando === 'sim' && <IconSpinner size={13} />}
              Conectar
            </button>
          </div>
          <p className="mcp-conectar-nota">Você pode desconectar quando quiser, no seu Perfil.</p>
        </div>
      )}
    </div>
  );
}
