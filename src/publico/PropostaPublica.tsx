// ─────────────────────────────────────────────────────────────────────────────
//  A proposta aberta pelo link que a casa mandou ao cliente.
//
//  O servidor devolve só os campos; a apresentação é montada aqui, pelo mesmo
//  montador do "Ver" do histórico. Assim o cliente vê exatamente o que o time
//  viu, sem uma segunda cópia do HTML guardada que pudesse ficar para trás.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { htmlDaProposta } from '../lib/proposta/gerar';
import type { DadosProposta } from '../lib/proposta/tipos';

export default function PropostaPublica({ token }: { token: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('Proposta · Sheep Technology');
  const [erro, setErro] = useState('');
  const quadro = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let vivo = true;
    fetch('/api/admin-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'proposta-publica', token }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(async ({ ok, d }) => {
        if (!vivo) return;
        if (!ok) { setErro(String(d?.error ?? 'Esta proposta não está mais disponível.')); return; }
        const dados = d.dados as DadosProposta;
        const pronto = await htmlDaProposta(dados);
        if (!vivo) return;
        if (!pronto) { setErro('Não foi possível abrir esta proposta.'); return; }
        setTitulo(`Proposta · ${dados.cliente} · Sheep Technology`);
        setHtml(pronto);
      })
      .catch(() => { if (vivo) setErro('Não foi possível abrir esta proposta.'); });
    return () => { vivo = false; };
  }, [token]);

  useEffect(() => { document.title = titulo; }, [titulo]);

  if (erro) {
    return (
      <div className="prop-publica">
        <p className="prop-publica-erro surge">{erro}</p>
      </div>
    );
  }
  if (html == null) {
    return (
      <div className="prop-publica">
        <div className="dux-spinner-row"><span className="dux-spinner" /></div>
      </div>
    );
  }
  // A apresentação ocupa a janela inteira. O foco vai para dentro dela ao
  // carregar, para as setas do teclado passarem os slides sem um clique antes.
  return (
    <iframe ref={quadro} className="prop-publica-deck" srcDoc={html} title={titulo}
      onLoad={() => quadro.current?.contentWindow?.focus()} />
  );
}
