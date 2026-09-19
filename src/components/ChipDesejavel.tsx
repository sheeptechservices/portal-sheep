// ─────────────────────────────────────────────────────────────────────────────
//  O objetivo desejável: não é obrigatório, mas seria de grande valor se
//  saísse. É marcado com o chip âmbar e a estrela cheia, na Planning e no quadro
//  de objetivos do cabeçalho - o mesmo desenho nos dois lugares.
//
//  Âmbar, e não o `--yellow`: o amarelo da casa é o verde da marca, e o chip
//  precisa ler como "extra de valor", não como destaque de marca.
// ─────────────────────────────────────────────────────────────────────────────
import { IconEstrela } from './icons';
import { AcaoDoObjetivo, ICONE_DA_ACAO } from './AcaoDoObjetivo';

/** O chip de leitura. */
export function ChipDesejavel() {
  return (
    <span className="chip-desejavel" title="Desejável: não é obrigatório, mas seria de grande valor se saísse">
      <IconEstrela size={11} preenchida /> Desejável
    </span>
  );
}

/**
 * A marca que se liga e desliga, na moldura das ações do objetivo. Ligada, é
 * a pílula âmbar com a estrela cheia; desligada, só a estrela vazada - quem
 * usa decide se ela fica à vista ou só no hover.
 */
export function AlternarDesejavel({ ligado, onChange, className }: {
  ligado: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <AcaoDoObjetivo
      className={`desejavel${ligado ? ' ligado' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={ligado}
      rotulo={ligado ? 'Tirar a marca de desejável' : 'Marcar como desejável'}
      title={ligado
        ? 'Desejável: não é obrigatório, mas seria de grande valor. Clique para tirar a marca.'
        : 'Marcar como desejável: não obrigatório, mas de grande valor se sair'}
      onMouseDown={e => e.preventDefault()}
      onClick={() => onChange(!ligado)}>
      <IconEstrela size={ICONE_DA_ACAO} preenchida={ligado} />
      {ligado && 'Desejável'}
    </AcaoDoObjetivo>
  );
}
