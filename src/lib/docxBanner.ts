// Correção do banner (faixa preta com o logo) no documento renderizado pelo
// docx-preview. Nos templates o banner é uma imagem ANCORADA à página com
// `wrapNone`; o docx-preview traduz isso num wrapper de tamanho zero
// (position:relative; width:0; height:0), então o banner não reserva espaço e o
// conteúdo seguinte renderiza POR CIMA dele - dando aquele efeito "flutuando no
// meio da página". No Word/LibreOffice a âncora funciona, por isso o .docx em si
// está correto; o defeito é só desta renderização.
//
// Aqui reposicionamos o banner para o topo da primeira página, em bloco e
// full-bleed (colado nas bordas da página), que é como deve aparecer.
export function ajustarBannerDocx(raiz: HTMLElement | null | undefined) {
  if (!raiz) return;

  // O template não tem cabeçalho de página, mas o docx-preview cria uma <header>
  // vazia por seção e ainda reserva altura pra ela (minHeight = topo - header).
  // Isso vira uma faixa branca acima do banner ao imprimir. Como não tem
  // conteúdo, removemos.
  for (const h of Array.from(raiz.querySelectorAll('header')) as HTMLElement[]) {
    if (!h.querySelector('img') && !(h.textContent ?? '').trim()) h.remove();
  }

  const imgs = Array.from(raiz.querySelectorAll('img')) as HTMLImageElement[];
  for (const img of imgs) {
    // Aspecto vindo do estilo que o docx-preview aplica (largura/altura em cm);
    // funciona mesmo antes de a imagem decodificar. Cai para o natural se preciso.
    const larg = parseFloat(img.style.width) || img.naturalWidth || 0;
    const alt = parseFloat(img.style.height) || img.naturalHeight || 0;
    const aspecto = alt ? larg / alt : 0;
    // O banner é uma faixa bem mais larga que alta; outras imagens não passam.
    if (aspecto < 4) continue;

    // A classe da seção muda conforme a opção `className` do render (ex.: na
    // prévia é `gd-docx`), então casamos pela tag <section>, não pela classe.
    const secao = img.closest('section') as HTMLElement | null;
    if (!secao) continue;
    const wrapper = (img.parentElement && img.parentElement !== secao)
      ? (img.parentElement as HTMLElement)
      : img;

    // As seções do docx-preview têm padding = margens da página. Colar o banner
    // nessas bordas (margem negativa igual ao padding) mantém tudo dentro do
    // border-box, então o overflow:hidden da seção não corta.
    const cs = getComputedStyle(secao);
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padLeft = parseFloat(cs.paddingLeft) || 0;
    const padRight = parseFloat(cs.paddingRight) || 0;

    // Zera o posicionamento quebrado e transforma o banner num bloco no topo.
    wrapper.style.position = 'static';
    wrapper.style.display = 'block';
    wrapper.style.width = '';
    wrapper.style.height = '';
    wrapper.style.left = '';
    wrapper.style.top = '';
    wrapper.style.float = 'none';
    // A seção é flex-column: stretch alinha à largura do conteúdo e as margens
    // negativas estendem até as bordas da página (full-bleed).
    wrapper.style.alignSelf = 'stretch';
    wrapper.style.margin = `${-padTop}px ${-padRight}px 14px ${-padLeft}px`;

    img.style.position = 'static';
    img.style.display = 'block';
    img.style.width = '100%';
    img.style.height = 'auto';
    img.style.left = '';
    img.style.top = '';

    // Move o banner para o topo absoluto da primeira página.
    if (secao.firstChild !== wrapper) secao.insertBefore(wrapper, secao.firstChild);
  }
}

// Fixa o rodapé do documento na base de TODA página impressa (running footer),
// como no gerador do João. O docx-preview desenha o <footer> no fim do fluxo da
// seção, então numa última página curta ele fica solto no meio. `position:fixed`
// faz o Chrome repetir o elemento na base de cada folha ao imprimir. Só para o
// PDF - na prévia em tela o rodapé fica no fluxo normal.
//
// Precisa combinar com uma margem inferior no @page maior que a altura do rodapé,
// para o conteúdo não invadir a faixa dele.
export function fixarRodapeImpressao(
  raiz: HTMLElement | null | undefined,
  opcoes: { margemLateral?: string; distanciaBase?: string } = {},
) {
  if (!raiz) return;
  const { margemLateral = '25mm', distanciaBase = '10mm' } = opcoes;
  const rodapes = Array.from(raiz.querySelectorAll('footer')) as HTMLElement[];
  for (const rod of rodapes) {
    rod.style.position = 'fixed';
    rod.style.left = '0';
    rod.style.right = '0';
    rod.style.top = 'auto';
    rod.style.bottom = distanciaBase;
    rod.style.margin = '0';
    rod.style.minHeight = '0';
    // Alinha o conteúdo do rodapé com o corpo (mesma margem lateral).
    rod.style.paddingLeft = margemLateral;
    rod.style.paddingRight = margemLateral;
    rod.style.background = '#fff';
    rod.style.boxSizing = 'border-box';
  }
}
