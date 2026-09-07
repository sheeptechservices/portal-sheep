// ─────────────────────────────────────────────────────────────────────────────
//  A chave de liga e desliga do sistema.
//
//  É para a pergunta de duas respostas em que uma delas é "o normal": mostrar
//  ou não os resolvidos, receber ou não o aviso. Quando as duas respostas são
//  iguais em peso - "Projetos" ou "Faturamento" -, o certo é o `SegSwitch`, que
//  mostra as duas à vista.
//
//  É um `<button role="switch">`, e não um `<input type="checkbox">`: assim ele
//  herda o foco, o Enter e o Espaço do navegador sem nenhum código, e o rótulo
//  ao lado faz parte do próprio botão - clicar no texto liga, que é o que todo
//  mundo tenta fazer.
// ─────────────────────────────────────────────────────────────────────────────

export function Chave({ ligada, onChange, rotulo, nome, dica }: {
  ligada: boolean;
  onChange: (v: boolean) => void;
  /** O que a chave liga. Vai ao lado dela, e é parte do alvo do clique. */
  rotulo?: string;
  /** O nome para quem não vê a tela. Obrigatório quando não há rótulo ao lado -
   *  é o caso da chave que fica na ponta de uma linha cujo texto já explica o
   *  que ela faz. */
  nome?: string;
  dica?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      aria-label={rotulo ? undefined : nome}
      className={`chave${ligada ? ' ligada' : ''}`}
      onClick={() => onChange(!ligada)}
      title={dica}
    >
      <span className="chave-trilho" aria-hidden="true">
        <span className="chave-pino" />
      </span>
      {rotulo && <span className="chave-rotulo">{rotulo}</span>}
    </button>
  );
}
