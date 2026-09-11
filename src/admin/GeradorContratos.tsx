// ─────────────────────────────────────────────────────────────────────────────
//  Gerador de contratos.
//
//  São dois, e por enquanto só dois - o serviço prestado ao cliente e o contrato
//  de quem entra para trabalhar com a casa. O texto de cada contrato mora em
//  `src/lib/contrato*.ts`, escrito por inteiro: gerar é preencher os poucos
//  trechos que mudam e fechar o .docx. É por isso que a escolha vem antes do
//  formulário - são os campos do modelo que dizem o que a tela precisa perguntar.
//
//  Esta página substituiu o gerador de propostas portado da DUX (proposta
//  avulsa, lote e atualização), que saiu inteiro em 09/2026 junto com os modelos
//  de proposta, o cálculo de antecipação e o endpoint `gerar-documento`.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  IconBuilding, IconDoc, IconDownload, IconInbox, IconPlus, IconUpload, IconUser, IconX,
} from '../components/icons';
import { Abas } from '../components/Abas';
import { DatePicker } from '../components/DatePicker';
import { SelectSistema } from '../components/SelectSistema';
import { useAuth, useToast } from './AdminApp';
import { useApi } from './OportunidadesPage';
import { instante, tempoRelativo } from '../lib/datas';
import { useDegrauTrilha } from '../lib/trilha';
import { useTrocaDeNivel } from '../lib/useTrocaDeNivel';
import { baixarDocx, montarDocx } from '../lib/docx';
import { baixarPdf, gerarPdf, imagemDePng } from '../lib/pdf';
import { reaisPorExtenso } from '../lib/extenso';
import { cnpjValido, titulo } from '../lib/cnpj';
import { cnpjDeArquivo, TIPOS_ACEITOS } from '../lib/cnpjDeArquivo';
import { lookupCNPJ, type CNPJData } from '../lib/cnpjApi';
import {
  emCentavos, mascaraCep, mascaraCnpj, mascaraCpf, mascaraMoeda, mascaraRg,
} from '../lib/mascaras';
import { contratoColaborador, dataBr, type DadosColaborador } from '../lib/contratoColaborador';
import { contratoServicos, type DadosServicos } from '../lib/contratoServicos';
import type { Paragrafo } from '../lib/docx';

export type ModeloContrato = 'servicos' | 'colaborador';

interface Modelo {
  valor: ModeloContrato;
  titulo: string;
  desc: string;
  icone: ReactNode;
  /** O que o contrato trata, em três linhas. Serve para escolher a porta certa
   *  sem precisar abrir as duas. */
  cobre: string[];
}

const MODELOS: Modelo[] = [
  {
    valor: 'servicos',
    titulo: 'Serviços com clientes',
    desc: 'Prestação de serviço contratada por uma empresa cliente.',
    icone: <IconBuilding size={18} />,
    cobre: ['Dados do cliente', 'Objeto, etapas e presenças', 'Valor, pagamento e vigência'],
  },
  {
    valor: 'colaborador',
    titulo: 'Colaboradores',
    desc: 'Prestação de serviços e confidencialidade, com a PJ de quem trabalha com a Sheep.',
    icone: <IconUser size={18} />,
    cobre: ['Dados da contratada e do representante', 'Modalidade e início da vigência', 'Remuneração e prazo de pagamento'],
  },
];

/** Dois níveis: a escolha, e o contrato aberto. */
const fundura = (m: ModeloContrato | null) => (m ? 1 : 0);

/** "G D Fernandes" tem; "Guttemberg Dantas Fernandes" não. Inicial solta é
 *  abreviação, e abreviação não é nome de quem assina um contrato. */
const temAbreviacao = (nome: string) =>
  nome.split(/\s+/).some(p => p.replace(/\./g, '').length === 1);

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Com gênero, e não "Solteiro(a)": isto vai impresso num contrato assinado, e o
// parêntese ali é marca de formulário, não de instrumento.
/** O logotipo que abre o contrato. Vem do arquivo servido pelo portal, e não
 *  embutido no código: é a mesma marca do login, e trocar uma troca as duas.
 *  Falhando a leitura, o contrato sai sem ela - documento sem logo ainda é
 *  documento; documento que não sai não serve para nada. */
const LOGO = {
  largura: 4.5,                        // em centímetros, para o .docx
  altura: 4.5 * 78 / 340,              // o arquivo é 340 x 78
  pontos: (4.5 / 2.54) * 72,           // a mesma largura em pontos, para o PDF
};

async function lerLogo(): Promise<Uint8Array | null> {
  try {
    const r = await fetch('/logo-lockup.png');
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

/** O que a tela preencheu, de um modelo ou do outro. Os dois tem razao social
 *  e data de fecho, que e o que o historico precisa ler sem saber qual e. */
export type DadosDoContrato = DadosColaborador | DadosServicos;

/** Uma linha do historico: um contrato que ja saiu, com o que ele precisa
 *  para sair de novo. */
export interface ContratoGerado {
  id: number;
  modelo: ModeloContrato;
  titulo: string;
  dados: DadosDoContrato;
  autor_nome: string;
  criado_em: string;
  atualizado_em: string;
}

/** "Contrato_Maria_de_Sá_2026-09-08" - sem extensão, que é de quem grava.
 *  A limpeza é por classe de letra, e não por `\w`: sem isso "Sá" vira "S" e
 *  o arquivo perde justamente o nome de quem assina. */
const nomeDoArquivo = (d: DadosDoContrato) =>
  `Contrato_${d.razaoSocial.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '_') || 'Contrato'}`
  + `_${d.dataAssinatura}`;

/** O texto de cada modelo. É o único ponto da tela que sabe qual arquivo de
 *  `lib` responde por qual cartão. */
function paragrafosDoContrato(modelo: ModeloContrato, dados: DadosDoContrato): Paragrafo[] {
  return modelo === 'servicos'
    ? contratoServicos(dados as DadosServicos)
    : contratoColaborador(dados as DadosColaborador);
}

/**
 * O contrato, no modelo e no formato pedidos.
 *
 * Fora dos formulários de propósito: o histórico gera os mesmos dois arquivos a
 * partir do que ficou guardado, e duas cópias disto começariam iguais e
 * terminariam diferentes - no dia em que o cabeçalho mudasse, mudaria em uma só.
 */
async function gerarContrato(
  modelo: ModeloContrato, dados: DadosDoContrato, formato: 'pdf' | 'docx',
) {
  const paragrafos = paragrafosDoContrato(modelo, dados);
  const logo = await lerLogo();
  if (formato === 'docx') {
    const bytes = montarDocx({
      paragrafos,
      imagemTopo: logo
        ? { bytes: logo, larguraCm: LOGO.largura, alturaCm: LOGO.altura }
        : undefined,
    });
    baixarDocx(bytes, `${nomeDoArquivo(dados)}.docx`);
    return;
  }
  const marca = logo ? imagemDePng(logo) : null;
  const conteudo = gerarPdf({
    paragrafos,
    imagemTopo: marca ? { ...marca, larguraPt: LOGO.pontos } : undefined,
  });
  baixarPdf(conteudo, `${nomeDoArquivo(dados)}.pdf`);
}

// ── O cadastro da Receita ────────────────────────────────────────────────────
//
//  Os dois contratos começam do mesmo jeito: um arquivo ou um número, o cadastro
//  da Receita, os campos preenchidos. O que muda entre eles é o que se faz com o
//  cadastro depois - o de colaborador precisa saber quem assina pela empresa, o
//  de serviços não pergunta isso ao cliente -, e é só isso que fica em cada um.

/** O cadastro, já na forma como o contrato escreve cada campo. */
interface CadastroDaReceita {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  endereco: string;
  bairro: string;
  cidade: string;
  /** "Florianópolis - SC": a cidade com o estado, que é como o contrato de
   *  serviços nomeia a sede do cliente. */
  cidadeComUf: string;
  cep: string;
  /** O CPF que veio colado no nome empresarial (MEI e empresário individual). */
  cpfDoNome: string | null;
  /** Quem pode assinar pela empresa, e de onde os nomes saíram. */
  nomes: string[];
  fonteDosNomes: 'socios' | 'cadastro';
}

/**
 * A resposta da Receita, normalizada.
 *
 * A Receita responde em maiúsculas, como o cartão impresso, e com o endereço em
 * pedaços. A caixa é acertada aqui, uma vez, para os dois caminhos - o arquivo e
 * o número digitado - preencherem o formulário do mesmo jeito.
 */
function cadastroDaReceita(d: CNPJData, digitos: string): CadastroDaReceita {
  // O nome empresarial de MEI e de empresário individual traz o CPF colado.
  const digitosDoNome = /\s(\d{11})\s*$/.exec(d.razao_social ?? '')?.[1] ?? null;
  const nome = (d.razao_social ?? '').replace(/\s*\d{6,}\s*$/, '').trim();

  // "RUA INHAUMA, 714" vira "Rua Inhauma, nº 714", que é como o contrato
  // escreve o endereço. O complemento vem em campo separado e entra no fim,
  // como o cartão impresso faz.
  const rua = titulo((d.logradouro ?? '').replace(/,\s*(\d+[A-Za-z]?)\s*$/, ', nº $1'))
    .replace(/,\s*Nº /, ', nº ');
  const cidade = titulo(d.municipio ?? '');
  const uf = (d.uf ?? '').trim().toUpperCase();

  // ── Quem assina pela empresa ────────────────────────────────────────────
  //
  // Três situações, e a Receita responde as três de jeitos diferentes:
  //
  //   1. Sociedade: o quadro de sócios diz quem são. Um só é resposta; vários
  //      viram uma lista para escolher.
  //   2. MEI: o CPF vem grudado no nome empresarial, e a razão social já é o
  //      nome da pessoa.
  //   3. Empresário individual: a firma É a pessoa, mas o quadro de sócios
  //      vem vazio. O nome dela está no cadastro - às vezes abreviado na
  //      razão social ("G D FERNANDES") e por extenso no nome fantasia
  //      ("GUTTEMBERG DANTAS FERNANDES"). Aí valem os dois, com o mais
  //      completo preenchido e o outro ao lado, para trocar num clique.
  const daSociedade = (d.socios ?? []).map(s => titulo(String(s))).filter(Boolean);
  const firmaEhPessoa = !!digitosDoNome
    || /empres[áa]rio|individual|microempreendedor/i.test(d.natureza_juridica ?? '');
  const doCadastro = firmaEhPessoa
    ? [...new Set([titulo(nome), titulo(d.nome_fantasia ?? '')])].filter(Boolean)
    : [];

  return {
    cnpj: mascaraCnpj(digitos),
    razaoSocial: titulo(nome),
    nomeFantasia: d.nome_fantasia || d.razao_social || '',
    endereco: [rua, d.complemento ? titulo(d.complemento) : ''].filter(Boolean).join(', '),
    bairro: titulo(d.bairro ?? ''),
    cidade,
    cidadeComUf: [cidade, uf].filter(Boolean).join(' - '),
    cep: d.cep ? mascaraCep(d.cep) : '',
    cpfDoNome: digitosDoNome ? mascaraCpf(digitosDoNome) : null,
    nomes: daSociedade.length ? daSociedade : doCadastro,
    fonteDosNomes: daSociedade.length ? 'socios' : 'cadastro',
  };
}

/**
 * O caminho "arquivo ou número → Receita → campos preenchidos".
 *
 * Quem chama diz o que fazer com o cadastro e devolve quantos campos encheu: é
 * essa contagem que vira o aviso na tela. `antes` limpa o que é derivado da
 * empresa e não pode sobreviver a uma consulta nova.
 */
function useReceita(
  token: string,
  aplicar: (c: CadastroDaReceita) => number,
  antes?: () => void,
) {
  const [lendo, setLendo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [lido, setLido] = useState<{ campos: number } | { erro: string } | null>(null);
  const [sobre, setSobre] = useState(false);
  /** O último número já consultado. Sem isto, cada tecla depois do 14º dígito
   *  dispararia a consulta de novo. */
  const jaBuscado = useRef('');
  const entrada = useRef<HTMLInputElement>(null);

  /** O mesmo preenchimento, pelo número: a Receita responde o cadastro de hoje,
   *  que é melhor do que a folha, emitida sabe-se lá quando. */
  async function buscar(numero: string) {
    const digitos = numero.replace(/\D/g, '');
    if (digitos.length !== 14) return;
    jaBuscado.current = digitos;
    setBuscando(true);
    setLido(null);
    antes?.();
    const d = await lookupCNPJ(digitos, token);
    setBuscando(false);
    if (!d) { setLido({ erro: 'Não achei este CNPJ na Receita.' }); return; }
    setLido({ campos: aplicar(cadastroDaReceita(d, digitos)) });
  }

  /**
   * O arquivo serve para uma coisa só: achar o CNPJ. O resto vem da Receita.
   *
   * Ler os campos da folha era o que existia antes, e era a parte frágil - cada
   * layout novo quebrava um campo, e o que se preenchia era o cadastro do dia
   * em que a folha foi emitida.
   */
  async function lerArquivo(arquivo: File | null | undefined) {
    if (!arquivo) return;
    setLendo(true);
    setLido(null);
    antes?.();
    const achado = await cnpjDeArquivo(arquivo);
    setLendo(false);
    if (!achado.ok) { setLido({ erro: achado.erro }); return; }
    await buscar(achado.cnpj);
  }

  return { lendo, buscando, lido, setLido, sobre, setSobre, jaBuscado, entrada, buscar, lerArquivo };
}

type Receita = ReturnType<typeof useReceita>;

/** A caixa de arrastar o arquivo, e o que a leitura dele respondeu. */
function CaixaDeArquivo({ receita }: { receita: Receita }) {
  const { lendo, buscando, lido, sobre, setSobre, entrada, lerArquivo } = receita;
  return (
    <>
      {/* `tabIndex` para poder receber o foco, e com ele o Ctrl+V: colar é um
          evento de quem está focado, e uma `div` solta nunca está. */}
      <div
        className={`gc-drop${sobre ? ' sobre' : ''}`}
        tabIndex={0}
        role="button"
        onClick={() => entrada.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); setSobre(true); }}
        onDragLeave={() => setSobre(false)}
        onDrop={e => { e.preventDefault(); setSobre(false); void lerArquivo(e.dataTransfer.files?.[0]); }}
        onPaste={e => {
          const arquivo = e.clipboardData?.files?.[0];
          if (arquivo) { e.preventDefault(); void lerArquivo(arquivo); }
        }}
      >
        <span className="gc-drop-icone">
          {lendo ? <span className="dux-spinner sm" /> : <IconUpload size={15} />}
        </span>
        <div>
          <p className="gc-drop-titulo">
            {lendo ? 'Procurando o CNPJ…' : buscando ? 'Buscando na Receita…' : 'Preencher por um arquivo (opcional)'}
          </p>
          <p className="gc-drop-desc">
            Arraste, cole com Ctrl+V ou clique para escolher - cartão CNPJ, contrato social,
            nota, print. Eu acho o CNPJ ali dentro e busco o cadastro na Receita.
          </p>
        </div>
        <input ref={entrada} type="file" accept={TIPOS_ACEITOS} hidden
          onChange={e => { void lerArquivo(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {lido && (
        <p className={`gc-leitura surge${'erro' in lido ? ' ruim' : ''}`}>
          {'erro' in lido
            ? lido.erro
            : `${lido.campos} campos vieram da Receita. Confira antes de gerar.`}
        </p>
      )}
    </>
  );
}

/**
 * O campo de CNPJ que consulta sozinho ao completar os 14 dígitos - não há
 * segundo passo a dar, e um botão para o óbvio é um clique a mais.
 *
 * É o primeiro campo dos dois contratos de propósito: digitado ele, o resto da
 * seção se preenche pela Receita. Embaixo da razão social, a pessoa preenchia à
 * mão o que ele traria pronto na linha seguinte.
 */
function CampoCnpj({ valor, onChange, receita }: {
  valor: string;
  onChange: (v: string) => void;
  receita: Receita;
}) {
  return (
    <label className="gc-campo">
      <span className="form-label">CNPJ</span>
      <input className="form-input" value={valor} placeholder="00.000.000/0001-00"
        inputMode="numeric" autoFocus
        onChange={e => {
          const novo = mascaraCnpj(e.target.value);
          onChange(novo);
          const digitos = novo.replace(/\D/g, '');
          if (digitos.length !== 14 || digitos === receita.jaBuscado.current) return;
          if (cnpjValido(digitos)) void receita.buscar(digitos);
          else receita.setLido({ erro: 'Este CNPJ não passa no dígito verificador. Confira os números.' });
        }} />
      {/* A espera é o giro da casa; parada, a linha diz o que o campo faz. */}
      <span className="gc-dica">
        {receita.buscando
          ? <><span className="dux-spinner sm" /> Buscando na Receita…</>
          : 'Preenche o resto pela Receita.'}
      </span>
    </label>
  );
}

const ESTADOS_CIVIS = [
  'Solteiro', 'Solteira', 'Casado', 'Casada', 'Divorciado', 'Divorciada',
  'Viúvo', 'Viúva', 'Em união estável',
];
const MODALIDADES = ['Home Office', 'Presencial', 'Híbrido'];

/** O formulário guarda tudo como texto - é o que a pessoa digita. Só o valor e
 *  os números viram número na hora de montar o documento. */
interface Formulario {
  razaoSocial: string;
  cnpj: string;
  nomeFantasia: string;
  endereco: string;
  bairro: string;
  cidade: string;
  cep: string;
  representante: string;
  nacionalidade: string;
  estadoCivil: string;
  rg: string;
  cpf: string;
  modalidade: string;
  remuneracao: string;
  horasMes: string;
  prazoPagamentoDias: string;
  dataInicio: string;
  cidadeAssinatura: string;
  dataAssinatura: string;
}

const VAZIO: Formulario = {
  razaoSocial: '', cnpj: '', nomeFantasia: '', endereco: '', bairro: '', cidade: '', cep: '',
  representante: '', nacionalidade: 'Brasileiro', estadoCivil: 'Solteiro', rg: '', cpf: '',
  modalidade: 'Home Office',
  remuneracao: '', horasMes: '176', prazoPagamentoDias: '7',
  dataInicio: hojeIso(), cidadeAssinatura: 'Maringá', dataAssinatura: hojeIso(),
};

/** Campo de texto simples, com rótulo e, quando faz sentido, máscara. */
function Campo({ rotulo, valor, onChange, placeholder, dica, mascara }: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  dica?: string;
  /** Formata o que foi digitado. Aplicada na entrada, e não na saída: o campo
   *  mostra o número tomando forma enquanto a pessoa digita. */
  mascara?: (v: string) => string;
}) {
  return (
    <label className="gc-campo">
      <span className="form-label">{rotulo}</span>
      <input className="form-input" value={valor} placeholder={placeholder}
        inputMode={mascara ? 'numeric' : undefined}
        onChange={e => onChange(mascara ? mascara(e.target.value) : e.target.value)} />
      {dica && <span className="gc-dica">{dica}</span>}
    </label>
  );
}

function FormColaborador({ token, onGerado }: {
  token: string;
  /** O contrato acabou de sair. Quem recebe e a pagina, que guarda o
   *  historico - o formulario nao conhece a lista, so avisa. */
  onGerado: (dados: DadosColaborador) => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<Formulario>(VAZIO);
  const set = <K extends keyof Formulario>(k: K) => (v: Formulario[K]) =>
    setF(atual => ({ ...atual, [k]: v }));

  /** Os nomes que a Receita dá para quem pode assinar. Com mais de um na mão
   *  não dá para adivinhar qual assina - a lista fica na tela e a escolha é do
   *  usuário. */
  const [socios, setSocios] = useState<string[]>([]);
  const [fonteDosNomes, setFonteDosNomes] = useState<'socios' | 'cadastro'>('socios');

  const receita = useReceita(
    token,
    c => {
      let quantos = 0;
      const por = <K extends keyof Formulario>(k: K, v: string) => {
        if (!v) return;
        quantos++;
        setF(atual => ({ ...atual, [k]: v }));
      };
      por('razaoSocial', c.razaoSocial);
      por('cnpj', c.cnpj);
      por('nomeFantasia', c.nomeFantasia);
      por('endereco', c.endereco);
      por('bairro', c.bairro);
      por('cidade', c.cidade);
      por('cep', c.cep);
      // Com CPF no nome empresarial, quem assina é a própria pessoa.
      if (c.cpfDoNome) {
        por('representante', c.razaoSocial);
        por('cpf', c.cpfDoNome);
      }
      if (c.nomes.length) {
        setFonteDosNomes(c.fonteDosNomes);
        // Entre "G D Fernandes" e "Guttemberg Dantas Fernandes", vale o escrito
        // por extenso: inicial solta não é nome de quem assina um contrato.
        const porExtenso = c.nomes.filter(n => !temAbreviacao(n));
        por('representante', porExtenso.length === 1 ? porExtenso[0] : c.nomes[0]);
        // A lista só aparece quando há alternativa de verdade.
        if (c.nomes.length > 1) setSocios(c.nomes);
      }
      return quantos;
    },
    // O nome de quem assina é derivado da empresa: o da consulta anterior não
    // pode sobreviver a uma consulta nova.
    () => { setSocios([]); setF(atual => ({ ...atual, representante: '' })); },
  );

  const centavos = emCentavos(f.remuneracao);
  const extenso = useMemo(
    () => (centavos ? reaisPorExtenso(centavos / 100) : ''),
    [centavos],
  );

  // Todo campo entra no contrato, e contrato com lacuna não se assina: nenhum
  // deles tem preenchimento automático nem valor de reserva. A lista segue a
  // ordem da tela, para quem lê o aviso saber para onde subir.
  const faltando = [
    !f.razaoSocial.trim() && 'nome ou razão social',
    !f.cnpj.trim() && 'CNPJ',
    !f.nomeFantasia.trim() && 'nome fantasia',
    !f.endereco.trim() && 'endereço',
    !f.bairro.trim() && 'bairro',
    !f.cidade.trim() && 'cidade',
    !f.cep.trim() && 'CEP',
    !f.representante.trim() && 'nome de quem assina',
    !f.nacionalidade.trim() && 'nacionalidade',
    !f.estadoCivil.trim() && 'estado civil',
    !f.rg.trim() && 'RG',
    !f.cpf.trim() && 'CPF',
    !f.modalidade.trim() && 'modalidade',
    !f.dataInicio && 'início da vigência',
    !centavos && 'valor mensal',
    !Number(f.horasMes) && 'horas por mês',
    !Number(f.prazoPagamentoDias) && 'prazo de pagamento',
    !f.cidadeAssinatura.trim() && 'cidade do fecho',
    !f.dataAssinatura && 'data do fecho',
  ].filter(Boolean) as string[];

  /** O que a tela preencheu, no formato que o contrato pede. */
  function reunir(): DadosColaborador {
    return {
      razaoSocial: f.razaoSocial.trim(),
      cnpj: f.cnpj.trim(),
      nomeFantasia: f.nomeFantasia.trim(),
      cidade: f.cidade.trim(),
      endereco: f.endereco.trim(),
      bairro: f.bairro.trim(),
      cep: f.cep.trim(),
      representante: f.representante.trim(),
      nacionalidade: f.nacionalidade.trim(),
      estadoCivil: f.estadoCivil,
      rg: f.rg.trim(),
      cpf: f.cpf.trim(),
      modalidade: f.modalidade,
      remuneracao: centavos / 100,
      horasMes: Number(f.horasMes.replace(/\D/g, '') || 0),
      prazoPagamentoDias: Number(f.prazoPagamentoDias.replace(/\D/g, '') || 0),
      dataInicio: f.dataInicio,
      cidadeAssinatura: f.cidadeAssinatura.trim(),
      dataAssinatura: f.dataAssinatura,
    };
  }

  /** Gerar e uma coisa so, e o formato e um detalhe dela: o documento e o
   *  mesmo, e o toast e o aviso ao historico tambem. */
  async function gerar(formato: 'pdf' | 'docx') {
    const dados = reunir();
    await gerarContrato('colaborador', dados, formato);
    toast('success', 'Contrato gerado', `${dados.razaoSocial}, a partir de ${dataBr(dados.dataInicio)}`);
    onGerado(dados);
  }

  return (
    <>
      <CaixaDeArquivo receita={receita} />

      <p className="gc-secao-titulo">A contratada</p>
      <div className="gc-grade">
        <CampoCnpj valor={f.cnpj} onChange={set('cnpj')} receita={receita} />
        <Campo rotulo="Nome ou razão social" valor={f.razaoSocial} onChange={set('razaoSocial')}
          placeholder="Maria Silva" />
        <Campo rotulo="Nome fantasia" valor={f.nomeFantasia} onChange={set('nomeFantasia')}
          placeholder="MARIA SILVA 12345678900" />
        <Campo rotulo="Endereço" valor={f.endereco} onChange={set('endereco')}
          placeholder="Avenida Brasil, nº 100" />
        <Campo rotulo="Bairro" valor={f.bairro} onChange={set('bairro')} />
        <Campo rotulo="Cidade" valor={f.cidade} onChange={set('cidade')} />
        <Campo rotulo="CEP" valor={f.cep} onChange={set('cep')} placeholder="00.000-000"
          mascara={mascaraCep} />
      </div>

      <p className="gc-secao-titulo">Quem assina pela contratada</p>
      <div className="gc-grade">
        <label className="gc-campo">
          <span className="form-label">Nome</span>
          <input className="form-input" value={f.representante} placeholder="Maria Silva"
            onChange={e => set('representante')(e.target.value)} />
          {socios.length > 1 && (
            <span className="gc-socios surge">
              <span className="gc-dica">
                {fonteDosNomes === 'socios' ? 'Sócios na Receita:' : 'No cadastro consta:'}
              </span>
              {socios.map(s => (
                <button key={s} type="button"
                  className={`gc-socio${f.representante === s ? ' escolhido' : ''}`}
                  onClick={() => set('representante')(s)}>
                  {s}
                </button>
              ))}
            </span>
          )}
        </label>
        <Campo rotulo="Nacionalidade" valor={f.nacionalidade} onChange={set('nacionalidade')} />
        <label className="gc-campo">
          <span className="form-label">Estado civil</span>
          <SelectSistema valor={f.estadoCivil} onChange={set('estadoCivil')}
            opcoes={ESTADOS_CIVIS.map(v => ({ valor: v, label: v }))} />
        </label>
        <Campo rotulo="RG" valor={f.rg} onChange={set('rg')} placeholder="3.705.450"
          mascara={mascaraRg} />
        <Campo rotulo="CPF" valor={f.cpf} onChange={set('cpf')} placeholder="000.000.000-00"
          mascara={mascaraCpf} />
      </div>

      <p className="gc-secao-titulo">O serviço</p>
      <div className="gc-grade">
        <label className="gc-campo">
          <span className="form-label">Modalidade</span>
          <SelectSistema valor={f.modalidade} onChange={set('modalidade')}
            opcoes={MODALIDADES.map(v => ({ valor: v, label: v }))} />
        </label>
        <label className="gc-campo">
          <span className="form-label">Início da vigência</span>
          <DatePicker value={f.dataInicio} onChange={set('dataInicio')} compact allowPast />
        </label>
      </div>

      <p className="gc-secao-titulo">Remuneração</p>
      <div className="gc-grade">
        <label className="gc-campo">
          <span className="form-label">Valor mensal</span>
          <input className="form-input" value={f.remuneracao} placeholder="R$ 5.800,00"
            inputMode="numeric"
            onChange={e => set('remuneracao')(mascaraMoeda(e.target.value))} />
          {/* O extenso é o que vale se os dois números discordarem, então ele
              aparece enquanto se digita, e não só no arquivo. */}
          <span className="gc-dica">{extenso ? `Por extenso: ${extenso}.` : 'Escrito por extenso no contrato.'}</span>
        </label>
        <Campo rotulo="Horas por mês" valor={f.horasMes} onChange={set('horasMes')}
          dica="Total aproximado, cláusula 5ª." mascara={v => v.replace(/\D/g, '').slice(0, 4)} />
        <Campo rotulo="Prazo de pagamento (dias)" valor={f.prazoPagamentoDias}
          onChange={set('prazoPagamentoDias')} dica="Contados da nota fiscal."
          mascara={v => v.replace(/\D/g, '').slice(0, 3)} />
      </div>

      <p className="gc-secao-titulo">Fecho</p>
      <div className="gc-grade">
        <Campo rotulo="Cidade" valor={f.cidadeAssinatura} onChange={set('cidadeAssinatura')} />
        <label className="gc-campo">
          <span className="form-label">Data</span>
          <DatePicker value={f.dataAssinatura} onChange={set('dataAssinatura')} compact allowPast />
        </label>
      </div>

      <RodapeDeGeracao faltando={faltando} gerar={formato => { void gerar(formato); }} />
    </>
  );
}

/** "Falta preencher: a, b e c." Acima de quatro, conta em vez de listar: uma
 *  lista de dezenove nomes não se lê, e empurra os botões para fora da tela. */
function avisoDoQueFalta(faltando: string[]): string {
  return faltando.length <= 4
    ? `Falta preencher: ${faltando.slice(0, -1).join(', ')}`
      + `${faltando.length > 1 ? ' e ' : ''}${faltando[faltando.length - 1]}.`
    : `Faltam ${faltando.length} campos: ${faltando.slice(0, 3).join(', ')} e mais ${faltando.length - 3}.`;
}

/** O rodapé de gerar, igual nos dois contratos. */
function RodapeDeGeracao({ faltando, gerar }: {
  faltando: string[];
  gerar: (formato: 'pdf' | 'docx') => void;
}) {
  return (
    <div className="gc-rodape">
      {/* O PDF na frente e em cor cheia: é o formato que se manda para
          assinar. O Word fica ao lado, para quando o contrato ainda precisa
          de um ajuste antes de sair. */}
      <button type="button" className="btn btn-primary" onClick={() => gerar('pdf')}
        disabled={faltando.length > 0}>
        <IconDownload size={14} /> Gerar em PDF
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => gerar('docx')}
        disabled={faltando.length > 0}>
        <IconDoc size={14} /> Gerar em Word
      </button>
      {faltando.length > 0 && <span className="gc-falta">{avisoDoQueFalta(faltando)}</span>}
    </div>
  );
}

/** Campo de texto longo: o mesmo rótulo e a mesma moldura do `Campo`, com
 *  altura para uma frase inteira. */
function CampoLongo({ rotulo, valor, onChange, placeholder, dica, linhas = 3 }: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  dica?: string;
  linhas?: number;
}) {
  return (
    <label className="gc-campo gc-campo-largo">
      <span className="form-label">{rotulo}</span>
      <textarea className="form-input" value={valor} placeholder={placeholder} rows={linhas}
        onChange={e => onChange(e.target.value)} />
      {dica && <span className="gc-dica">{dica}</span>}
    </label>
  );
}

/**
 * Campo de lista: uma linha por item, com o gesto do checklist da tarefa.
 *
 * Substituiu a caixa de texto de várias linhas, que pedia à pessoa que ela
 * mesma guardasse a regra ("um por linha") e obrigava a tela a adivinhar
 * depois o que era item e o que era continuação - inclusive limpando o "(i)"
 * ou o "2." que alguém tivesse digitado na frente. Aqui a estrutura é a do
 * campo: cada linha é um item porque não existe outro jeito de escrever.
 *
 * O marcador à esquerda é o mesmo que o contrato vai imprimir, então a lista na
 * tela já se lê como o parágrafo que ela vai virar.
 */
function CampoDeLinhas({ rotulo, itens, onChange, dica, placeholder, marca, botao }: {
  rotulo: string;
  itens: string[];
  onChange: (itens: string[]) => void;
  dica?: string;
  placeholder?: string;
  /** O que aparece na frente de cada linha: "(i)", "(ii)"... Sem ele, um ponto. */
  marca?: (i: number) => string;
  botao: string;
}) {
  const [escrevendo, setEscrevendo] = useState(false);
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState<number | null>(null);
  const [texto, setTexto] = useState('');

  function adicionar() {
    const limpo = novo.trim();
    setNovo('');
    if (limpo) onChange([...itens, limpo]);
  }

  /** Reescrever para nada é tirar: linha vazia num contrato é buraco. */
  function confirmar(i: number) {
    const limpo = texto.trim();
    setEditando(null);
    onChange(limpo ? itens.map((x, j) => (j === i ? limpo : x)) : itens.filter((_, j) => j !== i));
  }

  return (
    <label className="gc-campo gc-campo-largo">
      <span className="form-label">{rotulo}</span>
      <div className="gc-linhas">
        {itens.length > 0 && (
          <div className="checklist lista-anima" key={itens.length}>
            {itens.map((item, i) => (
              <div key={`${i}-${item}`} className="checklist-item">
                <span className="gc-linha-marca">{marca ? marca(i) : '·'}</span>
                {/* Ler e escrever no mesmo lugar: a troca é só de opacidade,
                    porque a linha não nasce nem some, ela muda de cara. */}
                {editando === i ? (
                  <input className="checklist-texto-campo troca" value={texto} autoFocus
                    aria-label={`Texto do item ${i + 1}`}
                    onChange={e => setTexto(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); confirmar(i); }
                      if (e.key === 'Escape') { e.preventDefault(); setEditando(null); }
                    }}
                    onBlur={() => confirmar(i)} />
                ) : (
                  <button type="button" className="checklist-texto troca"
                    title="Clique para editar"
                    onClick={() => { setTexto(item); setEditando(i); }}>
                    {item}
                  </button>
                )}
                <button type="button" className="checklist-tirar"
                  aria-label={`Tirar "${item}"`} title="Tirar da lista"
                  onClick={() => onChange(itens.filter((_, j) => j !== i))}>
                  <IconX size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Enter acrescenta e o campo continua ali: quem escreve uma lista
            escreve vários itens seguidos. Sair vazio recolhe de volta no "+". */}
        {escrevendo ? (
          <input className="checklist-novo troca" value={novo} autoFocus
            placeholder={placeholder}
            onChange={e => setNovo(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); adicionar(); }
              if (e.key === 'Escape') { setNovo(''); setEscrevendo(false); }
            }}
            onBlur={() => { adicionar(); setEscrevendo(false); }} />
        ) : (
          <button type="button" className="checklist-add troca" onClick={() => setEscrevendo(true)}>
            <IconPlus size={12} /> {botao}
          </button>
        )}
      </div>
      {dica && <span className="gc-dica">{dica}</span>}
    </label>
  );
}


// ── O contrato de serviços com o cliente ─────────────────────────────────────
//
//  A casa é a CONTRATADA aqui, e quem preenche é o cliente que contrata. O que
//  este formulário pergunta a mais que o do colaborador é o objeto: no contrato
//  de colaborador ele é fixo (desenvolvimento para os clientes da casa), e aqui
//  ele é o projeto - muda em cada contrato, e é a parte que o cliente lê
//  primeiro.

interface FormularioServicos {
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  bairro: string;
  cep: string;
  cidade: string;
  objeto: string;
  solucao: string;
  /** Listas: uma linha por item, como o contrato as imprime. */
  empresasDoGrupo: string[];
  semanasDiagnostico: string;
  semanasImplantacao: string;
  naoIncluso: string[];
  modalidade: string;
  remuneracaoMensal: string;
  prazoPagamentoDias: string;
  manutencaoPercent: string;
  vigenciaMeses: string;
  dataInicio: string;
  multaRescisaoPercent: string;
  cidadeAssinatura: string;
  dataAssinatura: string;
}

const VAZIO_SERVICOS: FormularioServicos = {
  razaoSocial: '', cnpj: '', endereco: '', bairro: '', cep: '', cidade: '',
  objeto: '', solucao: '', empresasDoGrupo: [],
  semanasDiagnostico: '1', semanasImplantacao: '1', naoIncluso: [],
  modalidade: 'Home Office', remuneracaoMensal: '', prazoPagamentoDias: '3',
  manutencaoPercent: '10', vigenciaMeses: '6', dataInicio: hojeIso(),
  multaRescisaoPercent: '35', cidadeAssinatura: 'Maringá', dataAssinatura: hojeIso(),
};

function FormServicos({ token, onGerado }: {
  token: string;
  onGerado: (dados: DadosServicos) => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<FormularioServicos>(VAZIO_SERVICOS);
  const set = <K extends keyof FormularioServicos>(k: K) => (v: FormularioServicos[K]) =>
    setF(atual => ({ ...atual, [k]: v }));

  // O cliente entra pelo mesmo caminho do colaborador: arquivo ou número, e o
  // cadastro vem da Receita. Só o nome de quem assina não é perguntado - o
  // contrato de serviços fecha com a razão social, e não com uma pessoa.
  const receita = useReceita(token, c => {
    let quantos = 0;
    const por = <K extends keyof FormularioServicos>(k: K, v: string) => {
      if (!v) return;
      quantos++;
      setF(atual => ({ ...atual, [k]: v }));
    };
    por('razaoSocial', c.razaoSocial);
    por('cnpj', c.cnpj);
    por('endereco', c.endereco);
    por('bairro', c.bairro);
    por('cep', c.cep);
    // Com o estado junto: é "Florianópolis - SC" que o contrato escreve.
    por('cidade', c.cidadeComUf);
    return quantos;
  });

  const centavos = emCentavos(f.remuneracaoMensal);
  const extenso = useMemo(
    () => (centavos ? reaisPorExtenso(centavos / 100) : ''),
    [centavos],
  );

  const numero = (v: string) => Number(v.replace(/\D/g, '') || 0);

  // Segue a ordem da tela, para quem lê o aviso saber para onde subir. O que
  // não está aqui é opcional de verdade: empresas do grupo, semanas presenciais
  // e o que fica de fora saem do contrato quando ficam em branco.
  const faltando = [
    !f.razaoSocial.trim() && 'razão social do cliente',
    !f.cnpj.trim() && 'CNPJ',
    !f.endereco.trim() && 'endereço',
    !f.bairro.trim() && 'bairro',
    !f.cep.trim() && 'CEP',
    !f.cidade.trim() && 'cidade',
    !f.objeto.trim() && 'o que está sendo contratado',
    !f.solucao.trim() && 'objetivo da solução',
    !f.modalidade.trim() && 'modalidade',
    !centavos && 'valor mensal',
    !numero(f.prazoPagamentoDias) && 'prazo de pagamento',
    !numero(f.manutencaoPercent) && 'percentual de manutenção',
    !numero(f.vigenciaMeses) && 'prazo mínimo',
    !f.dataInicio && 'início da vigência',
    !numero(f.multaRescisaoPercent) && 'multa de rescisão',
    !f.cidadeAssinatura.trim() && 'cidade do fecho',
    !f.dataAssinatura && 'data do fecho',
  ].filter(Boolean) as string[];

  /** O que a tela preencheu, no formato que o contrato pede. */
  function reunir(): DadosServicos {
    return {
      razaoSocial: f.razaoSocial.trim(),
      cnpj: f.cnpj.trim(),
      endereco: f.endereco.trim(),
      bairro: f.bairro.trim(),
      cep: f.cep.trim(),
      cidade: f.cidade.trim(),
      objeto: f.objeto.trim().replace(/\.$/, ''),
      solucao: f.solucao.trim().replace(/\.$/, ''),
      empresasDoGrupo: f.empresasDoGrupo,
      semanasDiagnostico: numero(f.semanasDiagnostico),
      semanasImplantacao: numero(f.semanasImplantacao),
      naoIncluso: f.naoIncluso,
      modalidade: f.modalidade,
      remuneracaoMensal: centavos / 100,
      prazoPagamentoDias: numero(f.prazoPagamentoDias),
      manutencaoPercent: numero(f.manutencaoPercent),
      vigenciaMeses: numero(f.vigenciaMeses),
      dataInicio: f.dataInicio,
      multaRescisaoPercent: numero(f.multaRescisaoPercent),
      cidadeAssinatura: f.cidadeAssinatura.trim(),
      dataAssinatura: f.dataAssinatura,
    };
  }

  async function gerar(formato: 'pdf' | 'docx') {
    const dados = reunir();
    await gerarContrato('servicos', dados, formato);
    toast('success', 'Contrato gerado', `${dados.razaoSocial}, a partir de ${dataBr(dados.dataInicio)}`);
    onGerado(dados);
  }

  return (
    <>
      <CaixaDeArquivo receita={receita} />

      <p className="gc-secao-titulo">A contratante</p>
      <div className="gc-grade">
        <CampoCnpj valor={f.cnpj} onChange={set('cnpj')} receita={receita} />
        <Campo rotulo="Razão social" valor={f.razaoSocial} onChange={set('razaoSocial')}
          placeholder="3S/A Serviços Administrativos LTDA" />
        <Campo rotulo="Endereço" valor={f.endereco} onChange={set('endereco')}
          placeholder="Rua Saldanha Marinho, 374, Sala 701" />
        <Campo rotulo="Bairro" valor={f.bairro} onChange={set('bairro')} />
        <Campo rotulo="CEP" valor={f.cep} onChange={set('cep')} placeholder="00.000-000"
          mascara={mascaraCep} />
        <Campo rotulo="Cidade" valor={f.cidade} onChange={set('cidade')}
          placeholder="Florianópolis - SC" dica="Com o estado, como vai no contrato." />
      </div>

      <p className="gc-secao-titulo">O objeto</p>
      <div className="gc-grade">
        <CampoLongo rotulo="O que está sendo contratado"
          valor={f.objeto} onChange={set('objeto')}
          placeholder="desenvolver agentes de inteligência artificial que possam automatizar tarefas a serem mapeadas na fase inicial de diagnóstico"
          dica={'Continua a cláusula 1ª: "...na área de tecnologia, em especial para ISTO". '
            + 'Em minúscula e sem ponto final.'} />
        <CampoLongo rotulo="Objetivo principal da solução"
          valor={f.solucao} onChange={set('solucao')}
          placeholder="desenvolvimento de agentes de IA para automatizar tarefas que serão mapeadas no diagnóstico inicial do projeto"
          dica={'Continua "...terá como principal objetivo, conforme apresentado em proposta, '
            + 'o ISTO". A mesma frase da proposta, quando houver.'} />
        {/* As etapas do projeto não têm campo: elas são as quatro do contrato
            assinado, e descrevem como a casa entrega - não o que este cliente
            comprou. O que muda por contrato são os dois campos acima. */}
        <CampoDeLinhas rotulo="Não está incluso (opcional)" itens={f.naoIncluso}
          onChange={set('naoIncluso')} botao={f.naoIncluso.length ? 'Outro item' : 'Acrescentar um item'}
          marca={i => `(${['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'][i] ?? i + 1})`}
          placeholder="eventual semana adicional de implantação presencial"
          dica="Sem nenhum item, o parágrafo sai do contrato." />
      </div>

      <p className="gc-secao-titulo">Escopo e presença</p>
      <div className="gc-grade">
        <CampoDeLinhas rotulo="Empresas do grupo (opcional)" itens={f.empresasDoGrupo}
          onChange={set('empresasDoGrupo')}
          botao={f.empresasDoGrupo.length ? 'Outra empresa' : 'Acrescentar uma empresa'}
          placeholder="CONCIMED"
          dica="Uma por linha. Sem nenhuma, o parágrafo do grupo sai do contrato." />
        {/* Rótulo curto de propósito: em duas linhas ele empurra o campo para
            baixo e a fileira inteira sai do prumo. O "presencial" vive na
            dica, que é onde ele cabe. */}
        <Campo rotulo="Semanas de diagnóstico" valor={f.semanasDiagnostico}
          onChange={set('semanasDiagnostico')} dica="Presencial. Zero tira a visita do texto."
          mascara={v => v.replace(/\D/g, '').slice(0, 2)} />
        <Campo rotulo="Semanas de implantação" valor={f.semanasImplantacao}
          onChange={set('semanasImplantacao')} dica="Presencial. Zero tira a implantação do texto."
          mascara={v => v.replace(/\D/g, '').slice(0, 2)} />
        <label className="gc-campo">
          <span className="form-label">Modalidade do time</span>
          <SelectSistema valor={f.modalidade} onChange={set('modalidade')}
            opcoes={MODALIDADES.map(m => ({ valor: m, label: m }))} />
          <span className="gc-dica">Cláusula 3ª.</span>
        </label>
      </div>

      <p className="gc-secao-titulo">Remuneração e prazos</p>
      <div className="gc-grade">
        <label className="gc-campo">
          <span className="form-label">Valor mensal</span>
          <input className="form-input" value={f.remuneracaoMensal} placeholder="R$ 15.900,00"
            inputMode="numeric"
            onChange={e => set('remuneracaoMensal')(mascaraMoeda(e.target.value))} />
          {/* O extenso é o que vale se os dois números discordarem, então ele
              aparece enquanto se digita, e não só no arquivo. */}
          <span className="gc-dica">{extenso ? `Por extenso: ${extenso}.` : 'Escrito por extenso no contrato.'}</span>
        </label>
        <Campo rotulo="Prazo de pagamento (dias)" valor={f.prazoPagamentoDias}
          onChange={set('prazoPagamentoDias')} dica="Contados da nota fiscal."
          mascara={v => v.replace(/\D/g, '').slice(0, 3)} />
        <Campo rotulo="Manutenção (% do mensal)" valor={f.manutencaoPercent}
          onChange={set('manutencaoPercent')} dica="Custo inicial previsto, cláusula 10ª."
          mascara={v => v.replace(/\D/g, '').slice(0, 3)} />
        <Campo rotulo="Prazo mínimo (meses)" valor={f.vigenciaMeses}
          onChange={set('vigenciaMeses')} dica="Cláusula 11ª."
          mascara={v => v.replace(/\D/g, '').slice(0, 3)} />
        <label className="gc-campo">
          <span className="form-label">Início da vigência</span>
          <DatePicker value={f.dataInicio} onChange={set('dataInicio')} compact allowPast />
        </label>
        <Campo rotulo="Multa de rescisão (%)" valor={f.multaRescisaoPercent}
          onChange={set('multaRescisaoPercent')} dica="Sobre o valor do período restante."
          mascara={v => v.replace(/\D/g, '').slice(0, 3)} />
      </div>

      <p className="gc-secao-titulo">O fecho</p>
      <div className="gc-grade">
        <Campo rotulo="Cidade" valor={f.cidadeAssinatura} onChange={set('cidadeAssinatura')} />
        <label className="gc-campo">
          <span className="form-label">Data</span>
          <DatePicker value={f.dataAssinatura} onChange={set('dataAssinatura')} compact allowPast />
        </label>
      </div>

      <RodapeDeGeracao faltando={faltando} gerar={f2 => { void gerar(f2); }} />
    </>
  );
}

/**
 * O historico do modelo aberto: o que a casa ja emitiu por ele.
 *
 * Cada linha gera de novo os mesmos dois arquivos, a partir do que foi
 * preenchido na hora - e por isso a lista nao e so um registro do que
 * aconteceu, e a segunda via de tudo que ja saiu.
 */
function HistoricoContratos({ lista, aoBaixar }: {
  /** `null` enquanto a lista nao chegou. */
  lista: ContratoGerado[] | null;
  aoBaixar: (c: ContratoGerado, formato: 'pdf' | 'docx') => void | Promise<void>;
}) {
  if (lista == null) {
    return <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>;
  }

  if (!lista.length) {
    return (
      <div className="admin-empty" style={{ padding: '40px 0' }}>
        <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={30} /></p>
        <p>Nenhum contrato gerado por aqui ainda.</p>
        <p className="gc-hist-nota">
          Todo contrato que sai do gerador entra nesta lista, com o que foi preenchido -
          e daqui ele sai de novo, sem precisar digitar tudo outra vez.
        </p>
      </div>
    );
  }

  return (
    <ul className="gc-hist lista-anima" key={lista.map(c => c.id).join('|')}>
      {lista.map(c => (
        <li key={c.id} className="gc-hist-item">
          <span className="gc-icone"><IconDoc size={16} /></span>
          <div className="gc-hist-texto">
            <p className="gc-hist-titulo">{c.titulo}</p>
            <p className="gc-hist-meta">
              {instante(c.criado_em)} por {c.autor_nome}
              {c.atualizado_em !== c.criado_em && ` - refeito ${tempoRelativo(c.atualizado_em)}`}
            </p>
          </div>
          <div className="gc-hist-acoes">
            <button type="button" className="btn btn-secondary btn-sm"
              onClick={() => { void aoBaixar(c, 'pdf'); }}>
              <IconDownload size={13} /> PDF
            </button>
            <button type="button" className="btn btn-secondary btn-sm"
              onClick={() => { void aoBaixar(c, 'docx'); }}>
              <IconDoc size={13} /> Word
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** As duas abas de dentro do contrato aberto. */
type AbaDoGerador = 'gerar' | 'historico';

export default function GeradorContratos({ token }: { token: string }) {
  const api = useApi(token);
  const { toast } = useToast();
  const { usuario } = useAuth();
  const [escolhido, setEscolhido] = useState<ModeloContrato | null>(null);
  // O contrato sai e a escolha entra em dois tempos, como a troca de ferramenta
  // na casca. Tudo aqui embaixo lê `naTela`, e não `escolhido`: durante a saída
  // o formulário continua na tela, e ele precisa do modelo que estava aberto.
  const nivel = useTrocaDeNivel(escolhido, fundura);
  const modelo = MODELOS.find(m => m.valor === nivel.mostrado) ?? null;

  const [aba, setAba] = useState<AbaDoGerador>('gerar');
  // `null` = ainda não buscado. Diz duas coisas com uma variável: que a aba
  // precisa pedir a lista, e que não há lista na tela para o registro atualizar.
  const [historico, setHistorico] = useState<ContratoGerado[] | null>(null);

  // Com um contrato aberto, o caminho de pão ganha o nome dele, e "Gerador de
  // Contratos" vira o degrau que volta para a escolha.
  useDegrauTrilha(modelo ? modelo.titulo : null, () => setEscolhido(null));

  // Outro modelo é outra fila: a aba volta para o formulário e o histórico é
  // buscado de novo quando alguém pedir.
  useEffect(() => { setAba('gerar'); setHistorico(null); }, [escolhido]);

  // A lista só é buscada quando a aba é aberta, e uma vez por modelo aberto.
  // Quem entra no gerador para fazer um contrato não paga por uma consulta que
  // não vai olhar.
  useEffect(() => {
    if (aba !== 'historico' || historico != null || !modelo) return;
    let vivo = true;
    void api(`?action=contratos_gerados&modelo=${modelo.valor}`).then(r => {
      if (vivo) setHistorico(Array.isArray(r?.contratos) ? r.contratos : []);
    });
    return () => { vivo = false; };
  }, [aba, historico, modelo, api]);

  /**
   * O contrato acabou de sair, e o histórico passa a saber dele.
   *
   * A lista em memória só é mexida se já tiver sido carregada: quem nunca abriu
   * a aba vai buscá-la inteira, e este já vem dentro. O documento é gerado no
   * navegador antes disto - se o registro falhar, o contrato continua na mão de
   * quem pediu, e é o histórico que fica devendo.
   */
  const registrar = useCallback(async (m: ModeloContrato, dados: DadosDoContrato) => {
    const r = await api('', 'POST', {
      action: 'registrar_contrato', modelo: m, titulo: dados.razaoSocial, dados,
    });
    if (!r?.id) {
      toast('error', 'O contrato saiu, mas não entrou no histórico',
        r?.error ?? 'Gere de novo para registrar.');
      return;
    }
    const linha: ContratoGerado = {
      id: r.id, modelo: m, titulo: dados.razaoSocial, dados,
      autor_nome: usuario?.nome ?? 'você',
      criado_em: r.criado_em, atualizado_em: r.atualizado_em,
    };
    // Pelo id, e não por posição: refazer um contrato atualiza a linha dele lá
    // no servidor, e aqui ela sobe para o topo em vez de virar uma segunda.
    setHistorico(atual => (atual == null ? atual : [linha, ...atual.filter(c => c.id !== linha.id)]));
  }, [api, toast, usuario]);

  /**
   * A segunda via, a partir do que ficou guardado.
   *
   * O `catch` cobre a linha cuja guarda veio incompleta - de um modelo que
   * mudou de campos, ou de um JSON que nao abriu. Sem ele o clique nao faz
   * nada e nada explica por que, que e a pior das duas respostas.
   */
  const baixarDoHistorico = useCallback(async (c: ContratoGerado, formato: 'pdf' | 'docx') => {
    try {
      await gerarContrato(c.modelo, c.dados, formato);
    } catch {
      toast('error', 'Nao consegui refazer este contrato',
        'O que ficou guardado com ele nao da para montar o documento.');
    }
  }, [toast]);

  return (
    <div className="admin-content-wrap">
      <div>
        <h1 className="admin-page-title">Gerador de Contratos</h1>
        <p className="admin-page-desc">O texto do contrato vem do modelo; aqui entra só o que muda</p>
      </div>

      <style>{`
        .gc-card {
          background: var(--white); border: 1px solid var(--gray3);
          border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-card);
        }
        .gc-titulo { font-size: 15px; font-weight: 800; color: var(--black); letter-spacing: -0.01em; }
        .gc-sub { font-size: 12.5px; color: var(--gray); margin-top: 4px; line-height: 1.5; }
        .gc-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px; margin-top: 16px;
        }
        .gc-opcao {
          text-align: left; font-family: inherit; cursor: pointer;
          background: var(--white); border: 1px solid var(--gray3); border-radius: var(--radius-md);
          padding: 16px 18px; display: flex; flex-direction: column; gap: 3px;
          transition: transform var(--transition-spring), box-shadow var(--transition-spring),
                      background var(--transition), border-color var(--transition);
        }
        .gc-opcao:hover {
          transform: translateY(-2px); box-shadow: var(--shadow-card-hover);
          background: var(--card-hover-bg); border-color: var(--gray2);
        }
        .gc-opcao-titulo { font-size: 13.5px; font-weight: 800; color: var(--black); }
        .gc-opcao-desc { font-size: 11.5px; color: var(--gray2); }
        .gc-icone {
          display: inline-flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; flex: none; margin-bottom: 8px;
          border-radius: var(--radius-md); background: var(--gray4); color: var(--gray);
          transition: background var(--transition), color var(--transition);
        }
        .gc-opcao:hover .gc-icone { background: var(--yb); color: var(--on-yellow); }
        .gc-cobre {
          list-style: none; margin: 10px 0 0; padding: 10px 0 0;
          border-top: 1px solid var(--gray3);
          display: flex; flex-direction: column; gap: 4px;
        }
        .gc-cobre li { font-size: 11.5px; color: var(--gray); padding-left: 12px; position: relative; }
        .gc-cobre li::before {
          content: ''; position: absolute; left: 2px; top: 6px;
          width: 4px; height: 4px; border-radius: var(--radius-pill); background: var(--gray2);
        }
        .gc-topo {
          display: flex; align-items: flex-start; gap: 12px;
          padding-bottom: 16px; border-bottom: 1px solid var(--gray3);
        }
        .gc-topo .gc-icone { margin-bottom: 0; }
        .gc-espera {
          margin-top: 18px; padding: 22px 20px; text-align: center;
          border: 1px dashed var(--gray3); border-radius: var(--radius-md); background: var(--bg);
        }
        .gc-espera-titulo { font-size: 12.5px; font-weight: 800; color: var(--black); }
        .gc-espera-texto {
          font-size: 12px; color: var(--gray); line-height: 1.55;
          margin-top: 5px; max-width: 440px; margin-inline: auto;
        }

        /* ── Leitura do cartão CNPJ ── */
        .gc-drop {
          display: flex; align-items: center; gap: 12px; cursor: pointer;
          margin-top: 18px; padding: 14px 16px;
          border: 1px dashed var(--gray3); border-radius: var(--radius-md);
          background: var(--bg);
          transition: border-color var(--transition), background var(--transition);
        }
        .gc-drop:hover, .gc-drop.sobre { border-color: var(--yellow); background: var(--yd); }
        .gc-drop-icone {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; flex: none;
          border-radius: var(--radius-md); background: var(--white); color: var(--gray);
          border: 1px solid var(--gray3);
        }
        .gc-drop-titulo { font-size: 12.5px; font-weight: 800; color: var(--black); }
        .gc-drop-desc { font-size: 11.5px; color: var(--gray2); margin-top: 2px; line-height: 1.45; }
        .gc-leitura { font-size: 11.5px; color: var(--gray); margin-top: 8px; line-height: 1.45; }
        .gc-leitura.ruim { color: var(--red); }

        /* ── Formulário ── */
        .gc-secao-titulo {
          font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase;
          color: var(--gray2); margin-top: 22px;
        }
        .gc-grade {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px; margin-top: 10px;
        }
        .gc-campo { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        /* Campo de frase inteira ocupa a grade toda: espremido numa coluna de
           220px, o objeto do contrato vira uma janelinha de três palavras. */
        .gc-campo-largo { grid-column: 1 / -1; }
        .gc-campo-largo textarea.form-input { line-height: 1.5; }

        /* Campo de lista: a casca e a do campo de texto, e o conteudo e o
           checklist da tarefa. Sem a casca, a lista ficava solta no meio de uma
           grade de campos com moldura e nao se lia como campo. O realce de foco
           e o mesmo do campo de texto, so que disparado por quem esta dentro.
           Crase nenhuma neste bloco: ele mora num template literal. */
        .gc-linhas {
          padding: 5px 6px;
          background: var(--white);
          border: 1.5px solid var(--gray3);
          border-radius: var(--radius-md);
          transition: border-color var(--transition-spring), box-shadow var(--transition-spring);
        }
        .gc-linhas:focus-within {
          border-color: var(--gray2);
          box-shadow: 0 0 0 3px var(--gray4);
        }
        .gc-linhas .checklist { margin-bottom: 2px; }
        .gc-linhas .checklist-novo { height: 28px; }
        /* O marcador da linha e o que o contrato vai imprimir na frente dela. */
        .gc-linha-marca {
          flex-shrink: 0;
          min-width: 22px;
          padding-top: 1px;
          font-size: 12px;
          font-weight: 700;
          color: var(--gray2);
        }
        .gc-dica { font-size: 11px; color: var(--gray2); line-height: 1.4; }
        .gc-campo .gc-dica .dux-spinner { margin-right: 5px; vertical-align: -1px; }
        .gc-socios { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
        .gc-socio {
          font-family: inherit; font-size: 11px; font-weight: 700; cursor: pointer;
          color: var(--gray); background: var(--white);
          border: 1px solid var(--gray3); border-radius: var(--radius-pill);
          padding: 3px 10px;
          transition: border-color var(--transition), color var(--transition),
                      background var(--transition);
        }
        .gc-socio:hover { border-color: var(--gray2); color: var(--black); }
        .gc-socio.escolhido { border-color: var(--yellow); background: var(--yd); color: var(--black); }
        .gc-drop:focus-visible { border-color: var(--gray2); outline: none; }
        .gc-rodape {
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
          margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--gray3);
        }
        .gc-falta { font-size: 11.5px; color: var(--gray2); }

        /* ── Histórico ── */
        /* O painel que nao esta na aba sai por display, e nao desmontado: o
           formulario fica de pe com o que ja foi digitado. Crase nenhuma neste
           bloco - ele mora dentro de um template literal, e ela o fecharia. */
        .gc-fora { display: none; }
        .gc-hist {
          list-style: none; margin: 14px 0 0; padding: 0;
          display: flex; flex-direction: column; gap: 8px;
        }
        .gc-hist-item {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px; background: var(--white);
          border: 1px solid var(--gray3); border-radius: var(--radius-md);
        }
        .gc-hist-item .gc-icone { margin-bottom: 0; width: 30px; height: 30px; }
        .gc-hist-texto { flex: 1; min-width: 0; }
        .gc-hist-titulo {
          font-size: 13px; font-weight: 800; color: var(--black);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .gc-hist-meta { font-size: 11.5px; color: var(--gray2); margin-top: 2px; }
        .gc-hist-acoes { display: flex; gap: 6px; flex: none; }
        .gc-hist-nota {
          font-size: 11.5px; color: var(--gray2); line-height: 1.5;
          max-width: 420px; margin: 6px auto 0;
        }
        /* Estreito, os botões descem para a linha de baixo em vez de espremer o
           nome de quem assinou. */
        @media (max-width: 560px) {
          .gc-hist-item { flex-wrap: wrap; }
          .gc-hist-acoes { width: 100%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .gc-opcao { transition: none; }
          .gc-opcao:hover { transform: none; }
        }
      `}</style>

      <div className={`nivel ${nivel.classe}`}>
        {!modelo ? (
          <div className="gc-card">
            <p className="gc-titulo">Qual contrato você vai gerar?</p>
            <p className="gc-sub">
              Cada um tem o seu modelo, com o texto do contrato já escrito. Aqui você preenche
              só o que muda de um contrato para o outro - o resto sai pronto, com as datas do dia.
            </p>
            <div className="gc-grid">
              {MODELOS.map(m => (
                <button key={m.valor} type="button" className="gc-opcao"
                  onClick={() => setEscolhido(m.valor)}>
                  <span className="gc-icone">{m.icone}</span>
                  <span className="gc-opcao-titulo">{m.titulo}</span>
                  <span className="gc-opcao-desc">{m.desc}</span>
                  <ul className="gc-cobre">
                    {m.cobre.map(c => <li key={c}>{c}</li>)}
                  </ul>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="gc-card">
              <div className="gc-topo">
                <span className="gc-icone">{modelo.icone}</span>
                <div>
                  <p className="gc-titulo">{modelo.titulo}</p>
                  <p className="gc-sub">{modelo.desc}</p>
                </div>
              </div>

              {/* As abas ficam dentro do contrato aberto, e não na página: o
                  histórico é o deste modelo, e ao lado da escolha ele seria o
                  histórico de qual dos dois? */}
              <Abas valor={aba} onChange={setAba} style={{ marginTop: 16 }}
                opcoes={[
                  { valor: 'gerar', label: 'Gerar contrato' },
                  { valor: 'historico', label: 'Histórico' },
                ]} />

              {/* Os dois painéis ficam montados, e o que está fora da aba sai
                  por `display`. Desmontar o formulário para espiar o histórico
                  apagaria o contrato meio preenchido - e como a classe da
                  animação sai junto, voltar faz a entrada tocar de novo. */}
              <div className={aba === 'gerar' ? 'aba-painel' : 'gc-fora'}>
                {modelo.valor === 'colaborador' ? (
                  <FormColaborador token={token}
                    onGerado={dados => { void registrar('colaborador', dados); }} />
                ) : (
                  <FormServicos token={token}
                    onGerado={dados => { void registrar('servicos', dados); }} />
                )}
              </div>

              {/* Montado a partir da primeira visita, e daí em diante fica: a
                  lista já foi buscada, e remontá-la a cada troca de aba pediria
                  o mesmo de novo. */}
              {(aba === 'historico' || historico != null) && (
                <div className={aba === 'historico' ? 'aba-painel' : 'gc-fora'}>
                  <HistoricoContratos lista={historico} aoBaixar={baixarDoHistorico} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
