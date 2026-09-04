// ─────────────────────────────────────────────────────────────────────────────
//  Datas, num lugar só.
//
//  Havia seis funções chamadas `fmtData` espalhadas pelas telas, e elas já
//  tinham divergido: três devolviam "-" para data ausente, duas devolviam "" e
//  uma devolvia `null`. Mesmo nome, quatro comportamentos - e a escolha entre
//  eles acabava sendo a de quem copiou por último.
//
//  Aqui a ausência é um parâmetro, e não uma opinião de cada arquivo.
//
//  Um detalhe que se perde ao reescrever isto: a data de dia (`2026-09-04`) é
//  lida com `T00:00:00` colado atrás. Sem isso o navegador a trata como UTC e
//  quem está em Brasília vê o dia anterior.
// ─────────────────────────────────────────────────────────────────────────────

/** Um dia, em `dd/mm/aaaa`. */
export function dia(v: string | null | undefined, vazio = '-'): string {
  if (!v) return vazio;
  const [a, m, d] = String(v).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : vazio;
}

/** O mesmo dia em `dd/mm`, para onde não cabe o ano: chip, rodapé de card. */
export function diaCurto(v: string | null | undefined, vazio = ''): string {
  if (!v) return vazio;
  const [, m, d] = String(v).slice(0, 10).split('-');
  return d && m ? `${d}/${m}` : vazio;
}

/** Um instante, com hora: `04/09/2026, 14:30`. Para carimbo de acesso e de
 *  auditoria, onde o dia sozinho não basta. */
export function instante(iso: string | null | undefined, vazio = '-'): string {
  if (!iso) return vazio;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** "agora há pouco", "há 5 min", "há 3h", "há 2 dias", "há 4 meses". É o
 *  contexto rápido ao lado da data cheia, e nunca sozinho: passado um mês, o
 *  relativo situa mas não informa. */
export function tempoRelativo(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  const meses = Math.floor(dias / 30);
  return `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
}

/** O relativo curto da conversa: "agora", "há 5 min", "ontem", e a data seca
 *  quando já faz mais de dois dias. */
export function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const seg = Math.round((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  if (seg < 172800) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** O peso de um arquivo, como se lê: `1,4 MB`, `380 KB`. Mora aqui junto das
 *  datas porque é a mesma família - formato de leitura, não de cálculo. */
export function tamanho(b: number): string {
  return b >= 1024 * 1024
    ? `${(b / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;
}
