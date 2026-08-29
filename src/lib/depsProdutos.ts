// Produtos/módulos DEPS do contrato DUX. Os identificadores são os que a API da
// DEPS espera em `identificadorProduto` - mantidos num só lugar para o seletor
// da Análise de Crédito e o card de Integrações não saírem de sincronia.
export const PRODUTOS_DEPS: { id: string; nome: string }[] = [
  { id: '20C2F2B4', nome: 'Mix PJ 057' },
  { id: '059D4CF4', nome: 'Smart PJ 005' },
  { id: 'F081F788', nome: 'Smart PJ 022' },
  { id: '475A28FB', nome: 'Smart PJ 039' },
  { id: '61D351FE', nome: 'Smart PF 019' },
  { id: 'A7F51366', nome: 'Smart PF 020' },
];

// Produto usado para CNPJ quando DEPS_PRODUTO_PJ não está definido
// (mesmo default de api/deps-consulta.ts).
export const PRODUTO_PJ_DEFAULT = '20C2F2B4';

// "Mix PJ 057 · 20C2F2B4" - ou só o ID cru, se não estiver no contrato.
export function descreveProdutoDeps(id: string): string {
  const p = PRODUTOS_DEPS.find(x => x.id === id);
  return p ? `${p.nome} · ${p.id}` : id;
}
