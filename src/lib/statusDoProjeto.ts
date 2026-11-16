// A cor de cada status de projeto. Mora aqui, e não na página de Projetos,
// porque a busca rápida também pinta a pílula do projeto - e importar a página
// inteira só por esta tabela levaria o código dela junto para a busca.
//
// Verde só para concluído: no resto do sistema verde é desfecho positivo, e
// "em andamento" não é desfecho nenhum.
export const COR_STATUS_PROJETO: Record<string, string> = {
  'Em andamento': '#B58300',
  'Pausado': '#6E6F69',
  'Concluído': '#23A455',
  'Cancelado': '#D93025',
};
