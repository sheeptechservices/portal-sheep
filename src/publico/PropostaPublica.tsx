// ─────────────────────────────────────────────────────────────────────────────
//  A proposta aberta pelo link que a casa mandou ao cliente.
//
//  O servidor devolve só os campos; a apresentação é montada aqui, pelo mesmo
//  montador do "Ver" do histórico. Assim o cliente vê exatamente o que o time
//  viu, sem uma segunda cópia do HTML guardada que pudesse ficar para trás.
//
//  A proposta feita fora do gerador vem como arquivo: ele desce em partes,
//  todas de uma vez, e abre na janela inteira - o PDF no leitor do navegador, o
//  HTML como página, a imagem como imagem. O que o navegador não mostra
//  (PowerPoint, Keynote) aparece como o arquivo para baixar.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { IconDownload } from '../components/icons';
import { htmlDaProposta } from '../lib/proposta/gerar';
import { abreNaPrevia, baixarPartes, salvarArquivo } from '../lib/proposta/arquivo';
import type { DadosProposta } from '../lib/proposta/tipos';

interface ArquivoDoLink { nome: string; tipo: string; partes: number; cliente: string }

const pedir = (corpo: Record<string, unknown>) =>
  fetch('/api/admin-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  }).then(r => r.json().then(d => ({ ok: r.ok, d })));

export default function PropostaPublica({ token }: { token: string }) {
  const [html, setHtml] = useState<string | null>(null);
  /** O HTML veio de fora, e não do montador da casa: abre isolado. */
  const [deFora, setDeFora] = useState(false);
  const [arquivo, setArquivo] = useState<(ArquivoDoLink & { base64: string; url: string }) | null>(null);
  const [titulo, setTitulo] = useState('Proposta · Sheep Technology');
  const [erro, setErro] = useState('');
  const quadro = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let vivo = true;
    let criada = '';
    pedir({ action: 'proposta-publica', token })
      .then(async ({ ok, d }) => {
        if (!vivo) return;
        if (!ok) { setErro(String(d?.error ?? 'Esta proposta não está mais disponível.')); return; }
        if (d.arquivo) {
          const a = d.arquivo as ArquivoDoLink;
          const base64 = await baixarPartes(
            ordem => pedir({ action: 'proposta-publica-parte', token, ordem }).then(r => r.d), a.partes);
          if (!vivo) return;
          const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          if (a.tipo.startsWith('text/html')) {
            setDeFora(true);
            setHtml(new TextDecoder().decode(bytes));
          } else {
            criada = URL.createObjectURL(new Blob([bytes], { type: a.tipo }));
            setArquivo({ ...a, base64, url: criada });
          }
          setTitulo(`Proposta · ${a.cliente} · Sheep Technology`);
          return;
        }
        const dados = d.dados as DadosProposta;
        const pronto = await htmlDaProposta(dados);
        if (!vivo) return;
        if (!pronto) { setErro('Não foi possível abrir esta proposta.'); return; }
        setTitulo(`Proposta · ${dados.cliente} · Sheep Technology`);
        setHtml(pronto);
      })
      .catch(() => { if (vivo) setErro('Não foi possível abrir esta proposta.'); });
    return () => { vivo = false; if (criada) URL.revokeObjectURL(criada); };
  }, [token]);

  useEffect(() => { document.title = titulo; }, [titulo]);

  if (erro) {
    return (
      <div className="prop-publica">
        <p className="prop-publica-erro surge">{erro}</p>
      </div>
    );
  }
  if (arquivo) {
    const baixar = () => salvarArquivo(arquivo.base64, arquivo.tipo, arquivo.nome);
    // O que o navegador não mostra vira o próprio arquivo, para baixar.
    if (!abreNaPrevia(arquivo.tipo)) {
      return (
        <div className="prop-publica">
          <div className="prop-publica-cartao surge">
            <p className="prop-publica-cliente">{arquivo.cliente}</p>
            <p className="prop-publica-nome">{arquivo.nome}</p>
            <button type="button" className="btn btn-primary" onClick={baixar}>
              <IconDownload size={14} /> Baixar a proposta
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="prop-publica-arquivo">
        {arquivo.tipo.startsWith('image/')
          ? <div className="prop-publica-imagem"><img src={arquivo.url} alt={arquivo.nome} /></div>
          : <iframe className="prop-publica-quadro" src={arquivo.url} title={titulo} />}
        {/* O leitor de PDF do celular nem sempre abre dentro da página: o
            download fica sempre à mão. */}
        <button type="button" className="prop-publica-baixar" onClick={baixar} aria-label="Baixar a proposta">
          <IconDownload size={14} /> Baixar
        </button>
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
  // O HTML subido de fora roda isolado da página: sem `allow-same-origin`, ele
  // não alcança nada do portal.
  return (
    <iframe ref={quadro} className="prop-publica-deck" srcDoc={html} title={titulo}
      sandbox={deFora ? 'allow-scripts allow-popups allow-popups-to-escape-sandbox' : undefined}
      onLoad={() => quadro.current?.contentWindow?.focus()} />
  );
}
