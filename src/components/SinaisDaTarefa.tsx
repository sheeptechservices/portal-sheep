import { IconClip, IconComentario } from './icons';

/** O que a tarefa carrega além do título: conversa e arquivos. É a mesma peça
 *  nos dois quadros, o da tela de Tarefas e o do projeto.
 *
 *  Só aparece havendo algo - zero comentário não é uma informação, é a
 *  ausência dela, e um "0" em cada cartão de uma coluna cheia vira sujeira. */
export function SinaisDaTarefa({ t }: { t: { comentarios?: number; anexos?: number } }) {
  const conversa = t.comentarios ?? 0;
  const arquivos = t.anexos ?? 0;
  if (conversa === 0 && arquivos === 0) return null;
  return (
    <span className="tarefa-sinais">
      {conversa > 0 && (
        <span title={`${conversa} comentário${conversa > 1 ? 's' : ''}`}>
          <IconComentario size={12} />
          {conversa}
        </span>
      )}
      {arquivos > 0 && (
        <span title={`${arquivos} anexo${arquivos > 1 ? 's' : ''}`}>
          <IconClip size={12} />
          {arquivos}
        </span>
      )}
    </span>
  );
}
