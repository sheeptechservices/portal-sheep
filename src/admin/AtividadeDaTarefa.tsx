// ─────────────────────────────────────────────────────────────────────────────
//  A atividade de uma tarefa.
//
//  O desenho, as abas e o comportamento moram em `components/Atividade`, que é
//  o mesmo do painel do lead. Aqui fica só o que é da tarefa: de onde ler, para
//  onde enviar, e como o diário dela se lê em português.
//
//  Vive fora das telas porque o formulário de tarefa é compartilhado entre a
//  tela de Tarefas e o relatório de Gestão, e ele é quem monta isto aqui.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react';
import {
  Atividade, type ComentarioAtividade, type EventoAtividade,
} from '../components/Atividade';
import type { Pessoa } from './FormularioTarefa';

/** Uma linha do diário, como o servidor da tarefa a devolve. */
interface EventoDaTarefa {
  id: number;
  usuario_nome: string;
  acao: string;
  campo: string | null;
  de: string | null;
  para: string | null;
  criado_em: string;
}

const NOME_DO_CAMPO: Record<string, string> = {
  titulo: 'o título',
  descricao: 'a descrição',
  status: 'a etapa',
  prioridade: 'a prioridade',
  responsavel: 'o responsável',
  prazo: 'o prazo',
  entrega: 'a entrega',
  etiquetas: 'as etiquetas',
};

/** A frase de um evento, montada a partir do que mudou. */
export function frase(e: EventoDaTarefa): EventoAtividade {
  const base = { id: e.id, usuario_nome: e.usuario_nome, criado_em: e.criado_em };
  if (e.acao === 'criou') return { ...base, texto: 'criou a tarefa', de: null, para: null };
  if (e.acao === 'concluiu') return { ...base, texto: 'concluiu a tarefa', de: null, para: null };
  if (e.acao === 'reabriu') return { ...base, texto: 'reabriu a tarefa', de: null, para: null };
  const campo = NOME_DO_CAMPO[e.campo ?? ''] ?? e.campo ?? 'um campo';
  // Sem valores gravados (a descrição é assim) a frase para no verbo: dizer
  // "de vazio para vazio" seria pior que não dizer nada.
  if (!e.de && !e.para) return { ...base, texto: `editou ${campo}`, de: null, para: null };
  return { ...base, texto: `alterou ${campo}`, de: e.de, para: e.para };
}

/** O formato gravado da marcação é `@[Nome](id)`: guarda o nome do momento e o
 *  id para a ligação, sem depender de o nome continuar igual daqui a um ano. */
const MARCA = /@\[([^\]]+)\]\(([^)]+)\)/g;
const idsMarcados = (texto: string) => [...new Set([...texto.matchAll(MARCA)].map(m => m[2]))];

export function AtividadeDaTarefa({ tarefaId, pessoas, usuarioId, podeComentar, api }: {
  tarefaId: number;
  pessoas: Pessoa[];
  usuarioId: string | undefined;
  podeComentar: boolean;
  api: (path: string, method?: string, body?: unknown) => Promise<any>;
}) {
  // Preso ao id e ao `api`: um objeto novo a cada quadro faria a atividade
  // reler sem ninguém ter pedido.
  const dono = useMemo(() => ({
    chave: `tarefa:${tarefaId}`,
    ler: async () => {
      const r = await api(`?action=tarefa_atividade&id=${tarefaId}`);
      return {
        eventos: ((r?.eventos ?? []) as EventoDaTarefa[]).map(frase),
        comentarios: (r?.comentarios ?? []) as ComentarioAtividade[],
      };
    },
    enviar: (texto: string, anexos: unknown[], paiId: number | null) => api('', 'POST', {
      action: 'add_tarefa_comentario',
      tarefa_id: tarefaId, pai_id: paiId, texto,
      mencoes: idsMarcados(texto), anexos,
    }),
    excluir: (id: number) => api('', 'POST', { action: 'excluir_tarefa_comentario', id }),
    anexo: (id: number) => api(`?action=tarefa_comentario_anexo_base64&id=${id}`),
  }), [api, tarefaId]);

  return (
    <Atividade dono={dono} pessoas={pessoas} usuarioId={usuarioId}
      podeComentar={podeComentar} />
  );
}
