import type { ReactNode } from 'react';

// Ícones padrão do sistema (contorno, herdam a cor via currentColor).

export function IconEye({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Olho cortado - alterna com o IconEye no botão de mostrar/ocultar senha.
export function IconEyeOff({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.6 5.2A10.9 10.9 0 0112 5c7 0 11 7 11 7a20.5 20.5 0 01-3.4 4.3" />
      <path d="M6.5 6.6A20.3 20.3 0 001 12s4 7 11 7a10.8 10.8 0 005.5-1.4" />
      <path d="M9.9 9.9a3 3 0 004.2 4.2" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

export function IconDownload({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function IconTrash({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

// Base comum dos ícones de arquivo/tipo (traço, herda currentColor, alinha inline).
const baseIcoStyle = { display: 'inline-block', verticalAlign: '-0.15em', flexShrink: 0 } as const;
function Ico({ size = 14, traco = 1.8, children }: { size?: number; traco?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round"
      style={baseIcoStyle}>
      {children}
    </svg>
  );
}

// Anexo (clipe de papel).
export function IconClip({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.64 17.2a2 2 0 01-2.83-2.83l8.49-8.48" /></Ico>;
}
// Documento / PDF.
export function IconDoc({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></Ico>;
}
// Imagem.
export function IconImage({ size = 14 }: { size?: number }) {
  return <Ico size={size}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="M21 15l-5-5L5 21" /></Ico>;
}
// Link externo.
export function IconLink({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></Ico>;
}
// Pasta.
export function IconFolder({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></Ico>;
}
// Gráfico / relatório financeiro.
export function IconChart({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="12.5" y="7" width="3" height="10" /><rect x="18" y="13" width="0.01" height="4" /><path d="M18 13v4" /></Ico>;
}
// Prancheta / lista.
export function IconClipboard({ size = 14 }: { size?: number }) {
  return <Ico size={size}><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><path d="M9 12h6M9 16h4" /></Ico>;
}
// Arquivo compactado (zip).
export function IconZip({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /><path d="M11 5h1M11 8h1M11 11h1M10.6 13.5h1.8v2.2a.9.9 0 01-.9.9.9.9 0 01-.9-.9z" /></Ico>;
}

/* ─────────────────────────────────────────────────────────────────────────
   Conjunto que substituiu os emojis da interface. Mesma linguagem visual dos
   ícones acima: contorno 24x24, currentColor, traço 1.8, pontas arredondadas.
   Regra do sistema: nenhum emoji na UI - ver CLAUDE.md.
   ───────────────────────────────────────────────────────────────────────── */

// Confirmação simples - checklists, campos preenchidos, etapa concluída.
export function IconCheck({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M4.5 12.5l5 5 10-11" /></Ico>;
}
// Aprovado / salvo com sucesso.
export function IconCheckCircle({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="12" cy="12" r="9" /><path d="M8 12.3l2.7 2.7L16.2 9.4" /></Ico>;
}
// Publicar para fora - globo com meridiano e paralelo.
export function IconGlobo({ size = 14 }: { size?: number }) {
  return (
    <Ico size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
    </Ico>
  );
}
// Duplicar - dois retângulos deslocados, um por cima do outro.
export function IconDuplicar({ size = 14 }: { size?: number }) {
  return (
    <Ico size={size}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </Ico>
  );
}
// Fechar / remover - botões de modal, chips, itens de lista.
export function IconX({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M6 6l12 12M18 6L6 18" /></Ico>;
}
// Reprovado / falhou.
export function IconXCircle({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="12" cy="12" r="9" /><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" /></Ico>;
}
// Atenção / condicionantes.
export function IconAlert({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M10.3 3.9L2.5 17.4a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9.5v4M12 17h.01" /></Ico>;
}
// Alerta crítico.
export function IconAlertOctagon({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M8.4 2.5h7.2l5.9 5.9v7.2l-5.9 5.9H8.4l-5.9-5.9V8.4z" /><path d="M12 7.8v5M12 16.4h.01" /></Ico>;
}
// Dúvida / pedido de esclarecimento.
export function IconHelp({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="12" cy="12" r="9" /><path d="M9.3 9.4a2.8 2.8 0 015.4 1c0 1.9-2.7 2.8-2.7 2.8" /><path d="M12 17.2h.01" /></Ico>;
}
// Editar / redigir.
export function IconEdit({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M12.5 20.5H21" /><path d="M16.4 3.6a2.1 2.1 0 013 3L7.9 18.1l-4.1 1.1 1.1-4.1z" /></Ico>;
}
// Carregando. Gira via .dux-icon-spin, que respeita prefers-reduced-motion.
export function IconSpinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      className="dux-icon-spin" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      style={baseIcoStyle}>
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 00-9-9" />
    </svg>
  );
}
// Refazer do zero.
export function IconRefresh({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M20.5 4v5h-5" /><path d="M3.5 20v-5h5" /><path d="M4.7 9a8 8 0 0113.2-3l2.6 2.4" /><path d="M19.3 15a8 8 0 01-13.2 3L3.5 15.6" /></Ico>;
}
// Responder dentro da mesma conversa.
export function IconReply({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M8 5v6.5a3 3 0 003 3h8" /><path d="M15.5 11l4 3.5-4 3.5" /></Ico>;
}
// Enviar o que se acabou de escrever - o botao do campo de comentario.
export function IconEnviar({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M21.5 2.5L10.8 13.2" /><path d="M21.5 2.5l-6.8 19-3.9-8.3-8.3-3.9 19-6.8z" /></Ico>;
}
// Buscar / conferir.
export function IconSearch({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.1-4.1" /></Ico>;
}
// Balança - cruzamento de risco entre as partes.
export function IconScale({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M12 3.5v17M7 20.5h10M12 6l-7.5 2M12 6l7.5 2" /><path d="M1.5 13.5l3-5.5 3 5.5a3.2 3.2 0 01-6 0z" /><path d="M16.5 13.5l3-5.5 3 5.5a3.2 3.2 0 01-6 0z" /></Ico>;
}
// Cálculo de risco, taxa e limite.
export function IconCalculator({ size = 14 }: { size?: number }) {
  return <Ico size={size}><rect x="4" y="2.5" width="16" height="19" rx="2" /><rect x="7.5" y="5.8" width="9" height="3.4" rx="0.8" /><path d="M8.2 13h.01M12 13h.01M15.8 13h.01M8.2 17h.01M12 17h.01M15.8 17h.01" /></Ico>;
}
// Enviar arquivos.
export function IconUpload({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 8 12 3 17 8" /><line x1="12" y1="3" x2="12" y2="16" /></Ico>;
}
// Nota fiscal / comprovante.
export function IconReceipt({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M6 2.5h12v19l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" /><path d="M9 7.5h6M9 11.5h6M9 15.5h4" /></Ico>;
}
// Cruzamento de duas leituras.
export function IconShuffle({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M16 3.5h4.5V8" /><path d="M20.5 3.5L3.5 20.5" /><path d="M16 20.5h4.5V16" /><path d="M14.5 14.5l6 6" /><path d="M3.5 3.5l5 5" /></Ico>;
}
// Salvar.
export function IconSave({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h7" /></Ico>;
}
// Ação de IA - gerar, interpretar, sugerir.
export function IconSparkles({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M11 3l1.7 4.4 4.4 1.7-4.4 1.7L11 15.2 9.3 10.8 4.9 9.1l4.4-1.7z" /><path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></Ico>;
}
// Empresa / cedente.
export function IconBuilding({ size = 14 }: { size?: number }) {
  return <Ico size={size}><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M9.5 21.5v-4.2h5v4.2" /><path d="M8.3 6.5h.01M12 6.5h.01M15.7 6.5h.01M8.3 10.3h.01M12 10.3h.01M15.7 10.3h.01M8.3 14.1h.01M15.7 14.1h.01" /></Ico>;
}
// Indústria / sacado.
export function IconFactory({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M2.5 20a2 2 0 002 2h15a2 2 0 002-2V8.5l-6.5 4.5v-4.5l-6.5 4.5V4a2 2 0 00-2-2h-2a2 2 0 00-2 2z" /><path d="M7 18h.01M12 18h.01M17 18h.01" /></Ico>;
}
// Parecer gerado por IA.
export function IconBot({ size = 14 }: { size?: number }) {
  return <Ico size={size}><rect x="3.5" y="8" width="17" height="12.5" rx="3" /><path d="M12 8V5" /><circle cx="12" cy="3.6" r="1.4" /><path d="M8.5 13.3h.01M15.5 13.3h.01" /><path d="M9.6 16.9h4.8" /><path d="M1.5 12.6v3.3M22.5 12.6v3.3" /></Ico>;
}
// Decisão do operador.
export function IconTarget({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12h.01" /></Ico>;
}
// Imprimir / gerar PDF.
export function IconPrinter({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M6.5 9.5V3.5h11v6" /><path d="M6.5 18.5H5a2 2 0 01-2-2v-4.5a2 2 0 012-2h14a2 2 0 012 2V16.5a2 2 0 01-2 2h-1.5" /><rect x="6.5" y="14.5" width="11" height="6" rx="1" /></Ico>;
}
// Diretrizes / acervo de regras.
export function IconBook({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M4 4.8A2.8 2.8 0 016.8 2H20v16.4H6.8A2.8 2.8 0 004 21.2z" /><path d="M4 18.4A2.8 2.8 0 016.8 15.6H20" /></Ico>;
}
// Condições comerciais / valores.
export function IconMoney({ size = 14 }: { size?: number }) {
  return <Ico size={size}><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 12h.01M18 12h.01" /></Ico>;
}
// Anotação / justificativa escrita.
export function IconNote({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M19 13.2V19a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h5.6" /><path d="M16.4 3.6a2.1 2.1 0 013 3l-8.7 8.7-3.9 1 1-3.9z" /></Ico>;
}
// Pessoa / formalização.
export function IconUser({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="12" cy="8" r="4" /><path d="M4.5 21c0-4.1 3.4-6.6 7.5-6.6s7.5 2.5 7.5 6.6" /></Ico>;
}
// Saúde do projeto, em metáfora de tendência: a linha sobe, oscila ou cai.
// Só o desenho muda entre as três; a cor vem de fora, pelo currentColor.
export function IconTrendUp({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M3 17l5.5-5.5 3.5 3.5L21 6" /><path d="M15 6h6v6" /></Ico>;
}
export function IconTrendWavy({ size = 14 }: { size?: number }) {
  return (
    <Ico size={size}>
      <path d="M3 12l2.8-4.5 2.8 4.5 2.8-4.5 2.8 4.5H21" />
      <path d="M16 9L21 12l-5 3" />
    </Ico>
  );
}
// Sem leitura: a linha nem sobe nem cai, e o tracejado diz que não há dado.
export function IconTrendFlat({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M3 12h3.5M10.2 12h3.6M17.5 12H21" /></Ico>;
}
export function IconTrendDown({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M3 7l5.5 5.5 3.5-3.5L21 18" /><path d="M15 18h6v-6" /></Ico>;
}
// Prioridade, em barras que crescem com o nível: uma, duas ou três acesas. A
// barra apagada continua desenhada para o conjunto ter sempre a mesma silhueta,
// e a diferença entre os níveis se ler pela altura e não só pela quantidade.
function Barras({ size, acesas }: { size: number; acesas: 1 | 2 | 3 }) {
  return (
    <Ico size={size} traco={2}>
      <path d="M5.5 20v-4.5" opacity={acesas >= 1 ? 1 : 0.3} />
      <path d="M12 20v-9" opacity={acesas >= 2 ? 1 : 0.3} />
      <path d="M18.5 20v-13.5" opacity={acesas >= 3 ? 1 : 0.3} />
    </Ico>
  );
}
export function IconPrioridadeBaixa({ size = 14 }: { size?: number }) {
  return <Barras size={size} acesas={1} />;
}
export function IconPrioridadeMedia({ size = 14 }: { size?: number }) {
  return <Barras size={size} acesas={2} />;
}
export function IconPrioridadeAlta({ size = 14 }: { size?: number }) {
  return <Barras size={size} acesas={3} />;
}
// O topo da escala foge das barras de propósito: quatro alturas parecidas se
// confundem de relance, e o que urge tem que saltar.
export function IconPrioridadeMaxima({ size = 14 }: { size?: number }) {
  return (
    <Ico size={size} traco={2}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M12 8v4.8" />
      <path d="M12 16.3v.1" />
    </Ico>
  );
}
// Marcos de entrega. Todos partem do mesmo círculo e mudam só por dentro: no
// tamanho em que aparecem na lista, silhuetas diferentes viram borrão, e o que
// distingue os estados precisa caber no miolo.
export function IconMarcoPlanejado({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="12" cy="12" r="8.6" /></Ico>;
}
// Em andamento: ponteiros de relógio, o tempo correndo.
export function IconMarcoAndamento({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="12" cy="12" r="8.6" /><path d="M12 7.8V12l3 1.8" /></Ico>;
}
// Bloqueada: o corte.
export function IconMarcoBloqueado({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="12" cy="12" r="8.6" /><path d="M9.1 14.9l5.8-5.8" /></Ico>;
}
// Concluída: o certo.
export function IconMarcoConcluido({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="12" cy="12" r="8.6" /><path d="M8.4 12.2l2.5 2.5 4.7-5.1" /></Ico>;
}
// Validada: o segundo certo, como no mensageiro - um diz que saiu, dois dizem
// que chegou e foi aceito.
export function IconMarcoValidado({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="12" cy="12" r="8.6" /><path d="M6.6 12.2l2.3 2.3 3.5-3.9M11.2 14.6l.8.8 4.4-4.8" /></Ico>;
}
// Cancelada: o descarte.
export function IconMarcoCancelado({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="12" cy="12" r="8.6" /><path d="M9.4 9.4l5.2 5.2M14.6 9.4l-5.2 5.2" /></Ico>;
}
// Ordenação de uma lista: barras de comprimentos diferentes, da maior para a
// menor, que é como o critério de ordem é desenhado em toda parte.
export function IconOrdenar({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M4 7h16M4 12h10M4 17h5" /></Ico>;
}
// Agrupar uma lista: dois blocos empilhados. Os pontinhos da versão anterior
// viravam sujeira no tamanho em que o ícone aparece.
export function IconAgrupar({ size = 14 }: { size?: number }) {
  return (
    <Ico size={size}>
      <rect x="3.2" y="4" width="17.6" height="6.6" rx="2.2" />
      <rect x="3.2" y="13.4" width="17.6" height="6.6" rx="2.2" />
    </Ico>
  );
}
// As tres visoes de uma mesma lista, no seletor da barra de ferramentas.
// Quadro: colunas de alturas diferentes, que e o que um kanban parece de longe.
export function IconVisaoQuadro({ size = 14 }: { size?: number }) {
  return (
    <Ico size={size}>
      <rect x="3.2" y="3.2" width="7" height="17.6" rx="2.2" />
      <rect x="13.8" y="3.2" width="7" height="11" rx="2.2" />
    </Ico>
  );
}
// Lista: marcador e linha, repetidos.
export function IconVisaoLista({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M8 6h13M8 12h13M8 18h13M3.4 6h.01M3.4 12h.01M3.4 18h.01" /></Ico>;
}
// Tabela: a moldura com cabecalho e a primeira coluna destacada.
export function IconVisaoTabela({ size = 14 }: { size?: number }) {
  return (
    <Ico size={size}>
      <rect x="3.2" y="4" width="17.6" height="16" rx="2.2" />
      <path d="M3.2 9.6h17.6M9.8 9.6V20" />
    </Ico>
  );
}
// Etapa de conversao: a que fecha o fluxo. Preenchida quando esta marcada, para
// ler acesa de relance no meio da linha.
export function IconEstrela({ size = 14, preenchida }: { size?: number; preenchida?: boolean }) {
  return (
    <Ico size={size}>
      <path d="M12 3.2l2.78 5.63 6.22.9-4.5 4.38 1.06 6.19L12 17.38l-5.56 2.92 1.06-6.19-4.5-4.38 6.22-.9z"
        fill={preenchida ? 'currentColor' : 'none'} />
    </Ico>
  );
}
// Etapa desconsiderada: fica de fora da conta.
export function IconProibido({ size = 14 }: { size?: number }) {
  return <Ico size={size}><circle cx="12" cy="12" r="8.6" /><path d="M6 6l12 12" /></Ico>;
}
// Coluna recolhida ou aberta: as setas apontam para dentro quando ela vai fechar.
export function IconRecolher({ size = 14, aberta }: { size?: number; aberta?: boolean }) {
  return aberta
    ? <Ico size={size}><path d="M20 17l-5-5 5-5M4 7l5 5-5 5" /></Ico>
    : <Ico size={size}><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /></Ico>;
}
// Triangulo do bloco recolhivel, no desenho de editor de texto: preenchido,
// pequeno, apontando para a direita fechado e para baixo aberto (o giro fica no
// CSS). Preenchido de proposito - o contorno some no tamanho em que ele aparece.
export function IconTriangulo({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill="currentColor" stroke="none">
      <path d="M8 4.5l10 7.5-10 7.5z" />
    </svg>
  );
}
// Punho de arrastar: seis pontos, o mesmo desenho ja usado nas etapas do funil.
// Os circulos vao preenchidos de proposito - o ponto vazado some no tamanho em
// que o punho aparece.
export function IconArrastar({ size = 14 }: { size?: number }) {
  return (
    <Ico size={size}>
      <circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </Ico>
  );
}
// Etapa de entrada de um quadro: a bandeja que recebe o que chega.
export function IconEntrada({ size = 14 }: { size?: number }) {
  return (
    <Ico size={size}>
      <path d="M3.2 13.4h4.4l1.4 2.4h6l1.4-2.4h4.4" />
      <path d="M3.2 13.4v4.4a2.2 2.2 0 002.2 2.2h13.2a2.2 2.2 0 002.2-2.2v-4.4" />
      <path d="M12 3.4v6.8M9.2 7.6L12 10.4l2.8-2.8" />
    </Ico>
  );
}
// Data-alvo numa linha de tabela.
export function IconCalendario({ size = 14 }: { size?: number }) {
  return <Ico size={size}><rect x="3.2" y="4.8" width="17.6" height="16" rx="2.4" /><path d="M3.2 9.6h17.6M8 3.2v3M16 3.2v3" /></Ico>;
}
// Estado vazio - nada por aqui.
export function IconInbox({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M21.5 12.5h-5.4l-1.8 3H9.7l-1.8-3H2.5" /><path d="M5.9 5.1L2.5 12.5V18a2 2 0 002 2h15a2 2 0 002-2v-5.5l-3.4-7.4A2 2 0 0016.3 4H7.7a2 2 0 00-1.8 1.1z" /></Ico>;
}
// Adicionar.
export function IconPlus({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M12 5v14M5 12h14" /></Ico>;
}
// Capturar pela câmera.
export function IconCamera({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V8.5a2 2 0 012-2h3.2l1.7-2.8h6.2l1.7 2.8H20a2 2 0 012 2z" /><circle cx="12" cy="13" r="3.8" /></Ico>;
}
// Navegação entre etapas - substitui as setas de texto ← e →.
export function IconArrowLeft({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></Ico>;
}
export function IconArrowRight({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></Ico>;
}
// Seta de recolher/expandir (acordeão, seletores).
// Seta de expandir uma linha: aponta para a direita fechada e gira ao abrir.
export function IconChevronRight({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M9 6l6 6-6 6" /></Ico>;
}
export function IconChevronDown({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M5.5 9l6.5 6.5L18.5 9" /></Ico>;
}
// Ordenação da tabela: crescente, decrescente e coluna sem ordenação.
export function IconChevronUp({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M5.5 15l6.5-6.5L18.5 15" /></Ico>;
}
export function IconChevronUpDown({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M7.5 10L12 5.5 16.5 10" /><path d="M7.5 14l4.5 4.5 4.5-4.5" /></Ico>;
}
// Abre em outra aba / serviço externo.
export function IconExternal({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M14 3.5h6.5V10" /><path d="M20.5 3.5L12 12" /><path d="M18 14v5.5a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h5.5" /></Ico>;
}
// Devolução / recompra - o valor volta para a carteira.
export function IconUndo({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M3.5 8.5h11a5.5 5.5 0 010 11H8" /><path d="M7.5 4L3.5 8.5 7.5 13" /></Ico>;
}

// Gestão de usuários e acessos - pessoa dentro do escudo de permissão.
export function IconAcessos({ size = 14 }: { size?: number }) {
  return <Ico size={size}><path d="M12 2.8l7.2 2.7v6c0 4.3-3 8.1-7.2 9.2-4.2-1.1-7.2-4.9-7.2-9.2v-6L12 2.8z" /><circle cx="12" cy="10.4" r="2.2" /><path d="M8.5 17c.5-1.9 1.9-2.9 3.5-2.9s3 1 3.5 2.9" /></Ico>;
}

// Painel / visão geral - grade de blocos de indicadores.
export function IconDashboard({ size = 14 }: { size?: number }) {
  return <Ico size={size}><rect x="3" y="3" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" /></Ico>;
}

// Regra de fluxo: a linha que desce e vira, com a ponta indicando o destino. É
// o que uma etiqueta com regra faz - manda a tarefa para outro lugar.
export function IconFluxo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4v8a3 3 0 0 0 3 3h8" />
      <path d="M14 12l3 3-3 3" />
    </svg>
  );
}

// Conversa: o balão do comentário.
export function IconComentario({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13.5a3 3 0 0 1-3 3H9l-4.5 3.5v-3.5H4a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3Z" />
    </svg>
  );
}

// Assistir: o triângulo do play, em traço como o resto.
export function IconPlay({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4.8v14.4L19.5 12 7 4.8Z" />
    </svg>
  );
}

// Marca do Google, para o botão de entrada. É a única exceção à regra de traço
// com currentColor deste arquivo: logotipo de terceiro tem cor própria fixada
// pelas diretrizes de marca deles, não pode herdar o tema nem virar contorno.
// Fica aqui mesmo assim, para nenhum SVG nascer solto dentro de uma página.
export function IconGoogle({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.6 7l7.7 6c4.5-4.2 7-10.3 7-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
