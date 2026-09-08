// ─────────────────────────────────────────────────────────────────────────────
//  O canal do cliente: um pedido sai daqui e cai na fila de chamados do time.
//
//  É a única coisa desta página que escreve. Ela existia para ler - acompanhar o
//  que foi contratado -, e faltava o caminho de volta: quem acompanha vê um
//  problema, lembra de um ajuste, tem uma ideia, e não tinha onde dizer sem
//  abrir o e-mail e procurar com quem falar.
//
//  O tipo do pedido vem primeiro, e em quatro cartões em vez de uma lista: é a
//  escolha que muda o resto - problema pede o que aconteceu, ideia pede o que se
//  quer - e é a que a pessoa faz sem pensar. Prioridade não se escolhe aqui:
//  quem define a ordem da fila é a casa, e um seletor de urgência num
//  formulário de cliente é um campo em que todo mundo marca "urgente".
//
//  Depois de enviado, o formulário sai e entra a confirmação com o número do
//  chamado. O número importa: é por ele que se pergunta depois.
//
//  O acesso é um balão fixo no canto de baixo à direita, e não uma seção no fim
//  da página: o pedido não acontece no fim da leitura, acontece no meio dela -
//  a pessoa está olhando uma entrega quando percebe o que quer dizer. Um botão
//  que está sempre ali é o que torna isso um gesto de um clique, em vez de uma
//  rolagem até o rodapé.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import {
  IconAlert, IconBalao, IconCheck, IconDoc, IconEdit, IconHelp, IconImage, IconSparkles,
  IconSpinner, IconTrash, IconUpload, IconX,
} from '../components/icons';

type Tipo = 'problema' | 'ajuste' | 'ideia' | 'duvida';

const TIPOS: { valor: Tipo; label: string; dica: string; icone: (p: { size?: number }) => JSX.Element }[] = [
  { valor: 'problema', label: 'Problema', dica: 'Algo não está funcionando', icone: IconAlert },
  { valor: 'ajuste', label: 'Ajuste', dica: 'Funciona, mas precisa mudar', icone: IconEdit },
  { valor: 'ideia', label: 'Nova ideia', dica: 'Algo que ainda não existe', icone: IconSparkles },
  { valor: 'duvida', label: 'Dúvida', dica: 'Uma pergunta para o time', icone: IconHelp },
];

const TIPOS_DE_ANEXO = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
const LIMITE = 5 * 1024 * 1024;
/** Um pedido raramente tem um print so: tem o da tela, o do erro e o PDF que
 *  veio por e-mail. */
const MAX_ANEXOS = 5;

const peso = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

interface Anexo { nome: string; tipo: string; tamanho: number; base64: string }

export function PedidoDoCliente({ token }: { token: string }) {
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  // Aberto e montado andam separados: o painel sai da árvore só depois de a
  // animação de saída correr, senão fechar seria um corte.
  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    if (aberto) { setMontado(true); return; }
    const t = window.setTimeout(() => setMontado(false), 200);
    return () => window.clearTimeout(t);
  }, [aberto]);

  const fechar = () => setAberto(false);

  // Escape fecha, e clique fora também - o painel é uma conversa de canto, não
  // um modal que prende a página.
  useEffect(() => {
    if (!aberto) return;
    const naTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    const noClique = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (painel.current?.contains(alvo)) return;
      if ((alvo as HTMLElement)?.closest?.('.pub-balao')) return;
      fechar();
    };
    document.addEventListener('keydown', naTecla);
    document.addEventListener('mousedown', noClique);
    return () => {
      document.removeEventListener('keydown', naTecla);
      document.removeEventListener('mousedown', noClique);
    };
  }, [aberto]);

  const pronto = !!tipo && assunto.trim().length >= 3 && mensagem.trim().length >= 5
    && nome.trim().length >= 2 && !enviando;

  async function receber(entrada: FileList | File[] | null | undefined) {
    const arquivos = [...(entrada ?? [])];
    if (!arquivos.length) return;
    setErro(null);
    const cabem = MAX_ANEXOS - anexos.length;
    if (cabem <= 0) { setErro(`São no máximo ${MAX_ANEXOS} anexos.`); return; }
    const novos: Anexo[] = [];
    for (const arquivo of arquivos.slice(0, cabem)) {
      if (!TIPOS_DE_ANEXO.includes(arquivo.type)) {
        setErro(`"${arquivo.name}" precisa ser uma imagem ou um PDF.`);
        continue;
      }
      if (arquivo.size > LIMITE) { setErro(`"${arquivo.name}" passa de 5 MB.`); continue; }
      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error('leitura'));
        fr.readAsDataURL(arquivo);
      }).catch(() => null);
      if (!base64) { setErro(`Não foi possível ler "${arquivo.name}".`); continue; }
      novos.push({ nome: arquivo.name || 'anexo', tipo: arquivo.type, tamanho: arquivo.size, base64 });
    }
    if (novos.length) setAnexos(a => [...a, ...novos]);
  }

  /* Colar com Ctrl+V, enquanto o painel esta aberto. O ouvinte fica no
     documento porque o `paste` so nasce em quem tem o foco, e a colagem que tem
     dono - um campo, uma area de texto - so e assumida quando esse dono esta
     aqui dentro. E o jeito mais comum de um print chegar: recortar a tela e
     colar, sem passar por seletor de arquivo nenhum. */
  useEffect(() => {
    if (!aberto) return;
    const aoColar = (e: ClipboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const dono = alvo?.closest?.('input, textarea, [contenteditable="true"]');
      if (dono && !painel.current?.contains(dono)) return;
      const dados = e.clipboardData;
      if (!dados) return;
      const daArea = [...(dados.files ?? [])];
      const dosItens = [...(dados.items ?? [])]
        .filter(i => i.kind === 'file')
        .map(i => i.getAsFile())
        .filter(Boolean) as File[];
      const colados = daArea.length ? daArea : dosItens;
      if (colados.length) {
        // So engole o evento quando havia arquivo: colar texto num campo
        // continua sendo colar texto.
        e.preventDefault();
        void receber(colados);
      }
    };
    document.addEventListener('paste', aoColar);
    return () => document.removeEventListener('paste', aoColar);
  });

  async function enviar() {
    if (!pronto) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/projeto-publico?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo, assunto: assunto.trim(), mensagem: mensagem.trim(),
          nome: nome.trim(), email: email.trim(),
          anexos: anexos.map(a => ({ nome: a.nome, tipo: a.tipo, base64: a.base64 })),
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setErro(d?.error ?? 'Não foi possível enviar agora. Tente de novo.'); return; }
      setNumero(Number(d?.numero ?? 0));
    } catch {
      setErro('A conexão falhou. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  // Ao abrir, o painel aparece rolado no topo: reabrir depois de enviar não pode
  // mostrar o meio de um formulário.
  useEffect(() => {
    if (aberto && painel.current) painel.current.querySelector('.pub-balao-corpo')?.scrollTo(0, 0);
  }, [aberto]);

  function outro() {
    setNumero(null);
    setTipo(null);
    setAssunto('');
    setMensagem('');
    setAnexos([]);
    setErro(null);
  }

  return (
    <>
      {/* O gatilho. Fica no canto o tempo todo, e some enquanto o painel está
          aberto - dois alvos para a mesma coisa, um em cima do outro, seria
          confusão. */}
      <button
        type="button"
        className={`pub-balao${aberto ? ' escondido' : ''}`}
        aria-expanded={aberto}
        onClick={() => setAberto(true)}
      >
        <span className="pub-balao-icone"><IconBalao size={17} /></span>
        <span className="pub-balao-texto">Fale com o time</span>
      </button>

      {montado && (
      <div className={`pub-balao-painel${aberto ? '' : ' saindo'}`} ref={painel}
        role="dialog" aria-label="Fale com o time">
        <div className="pub-balao-cabeca">
          <div>
            <strong>Fale com o time</strong>
            <small>Um pedido, uma dúvida, um problema</small>
          </div>
          <button type="button" className="pub-balao-fechar" aria-label="Fechar" onClick={fechar}>
            <IconX size={13} />
          </button>
        </div>

        <div className="pub-balao-corpo">
      {numero ? (
        <div className="pub-pedido-cartao pub-pedido-feito troca">
          <span className="pub-pedido-selo"><IconCheck size={20} /></span>
          <h3>Recebemos o seu pedido</h3>
          <p>
            Ele entrou na fila do time com o número <strong>#{numero}</strong>, com o nome deste
            projeto junto.{email.trim() ? ` O retorno vai para ${email.trim()}.` : ''}
          </p>
          <button type="button" className="pub-pedido-outro" onClick={outro}>
            Enviar outro pedido
          </button>
        </div>
      ) : (
        <div className="pub-pedido-cartao troca">
          <p className="pub-pedido-intro">
            Achou um problema, precisa de um ajuste ou teve uma ideia? Conte aqui. O pedido
            chega ao time com o nome deste projeto, e você recebe retorno pelo e-mail que deixar.
          </p>

          {/* O tipo primeiro, em cartões: é a escolha que orienta o resto do
              formulário, e a que se faz sem pensar. */}
          <div className="pub-pedido-tipos" role="radiogroup" aria-label="Tipo do pedido">
            {TIPOS.map(t => {
              const Icone = t.icone;
              const escolhido = tipo === t.valor;
              return (
                <button
                  key={t.valor}
                  type="button"
                  role="radio"
                  aria-checked={escolhido}
                  className={`pub-pedido-tipo${escolhido ? ' escolhido' : ''}`}
                  onClick={() => setTipo(t.valor)}
                >
                  <span className="pub-pedido-tipo-icone"><Icone size={16} /></span>
                  <strong>{t.label}</strong>
                  <small>{t.dica}</small>
                </button>
              );
            })}
          </div>

          {/* Os campos só aparecem depois do tipo: formulário inteiro à mostra
              antes da primeira escolha é uma parede, e a página é de quem está
              acompanhando um projeto, não de quem veio preencher formulário. */}
          <div className={`revelar${tipo ? ' aberto' : ''}`}>
            <div>
              <div className="pub-pedido-campos">
                <label className="pub-campo">
                  <span>Assunto</span>
                  <input
                    value={assunto}
                    maxLength={120}
                    placeholder={tipo === 'ideia' ? 'Em poucas palavras, o que você imaginou' : 'Em poucas palavras, do que se trata'}
                    onChange={e => setAssunto(e.target.value)}
                  />
                </label>

                <label className="pub-campo">
                  <span>{tipo === 'problema' ? 'O que aconteceu' : tipo === 'duvida' ? 'Sua pergunta' : 'O que você precisa'}</span>
                  <textarea
                    value={mensagem}
                    rows={5}
                    maxLength={4000}
                    placeholder={tipo === 'problema'
                      ? 'Onde aconteceu, o que você esperava e o que aconteceu no lugar.'
                      : 'Quanto mais detalhe, menos idas e vindas.'}
                    onChange={e => setMensagem(e.target.value)}
                  />
                </label>

                <div className="pub-pedido-dupla">
                  <label className="pub-campo">
                    <span>Seu nome</span>
                    <input value={nome} maxLength={80} placeholder="Como o time deve chamar você"
                      onChange={e => setNome(e.target.value)} />
                  </label>
                  <label className="pub-campo">
                    <span>Seu e-mail <em>(para o retorno)</em></span>
                    <input value={email} maxLength={120} type="email" placeholder="voce@empresa.com"
                      onChange={e => setEmail(e.target.value)} />
                  </label>
                </div>

                <input ref={seletor} type="file" multiple accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={e => { void receber(e.target.files); e.target.value = ''; }} />

                {anexos.length > 0 && (
                  <ul className="pub-pedido-anexos">
                    {anexos.map((a, i) => (
                      <li key={`${a.nome}-${i}`} className="pub-pedido-anexo">
                        {a.tipo === 'application/pdf'
                          ? <span className="pub-pedido-anexo-icone"><IconDoc size={14} /></span>
                          : <img src={a.base64} alt="" />}
                        <span className="pub-pedido-anexo-nome" title={a.nome}>{a.nome}</span>
                        <span className="pub-pedido-anexo-peso">{peso(a.tamanho)}</span>
                        <button type="button" aria-label={`Remover ${a.nome}`}
                          onClick={() => setAnexos(l => l.filter((_, j) => j !== i))}>
                          <IconTrash size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {anexos.length < MAX_ANEXOS && (
                  <button
                    type="button"
                    className={`pub-pedido-solta${arrastando ? ' sobre' : ''}`}
                    onClick={() => seletor.current?.click()}
                    onDragOver={e => { e.preventDefault(); setArrastando(true); }}
                    onDragLeave={() => setArrastando(false)}
                    onDrop={e => { e.preventDefault(); setArrastando(false); void receber(e.dataTransfer.files); }}
                  >
                    <IconImage size={14} />
                    <span>
                      <b>{anexos.length ? 'Anexe mais um print ou PDF' : 'Anexe prints ou PDFs'}</b>
                      <small>opcional - solte aqui, clique ou cole com Ctrl+V</small>
                    </span>
                    <IconUpload size={13} />
                  </button>
                )}

                {erro && (
                  <p className="pub-pedido-erro surge"><IconX size={11} /> {erro}</p>
                )}

                <div className="pub-pedido-pe">
                  <span className="pub-pedido-nota">
                    O que você escrever aqui vai para o time do projeto.
                  </span>
                  <button type="button" className="pub-pedido-enviar" disabled={!pronto} onClick={enviar}>
                    {enviando ? <><IconSpinner size={14} /> Enviando</> : 'Enviar pedido'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
      )}
    </>
  );
}
