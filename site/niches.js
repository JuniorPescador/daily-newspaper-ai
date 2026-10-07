// The paper's sections, shown as tabs. AI is the live edition at /; the others are "em breve"
// pages that count visits and take waitlist sign-ups, to measure demand before an edition exists.
// Shared by the page (site/chrome.js, site/soon.js) and the server (scripts/start.mjs).

export const NICHES = [
  { id: 'ia', label: 'IA', path: '/', status: 'live' },
  {
    id: 'marketing',
    label: 'Marketing',
    path: '/marketing',
    status: 'soon',
    cadence: 'Todo dia às 5h',
    audience: 'Para quem cuida de tráfego, SEO, social e CRM',
    pitch:
      'O que mudou ontem nas plataformas de anúncio, o que o mercado fez e como a IA está mudando o trabalho. Com o link da fonte e o porquê de cada notícia importar.',
    sections: [
      { name: 'Plataformas', line: 'O que mudou no Meta, Google, TikTok e LinkedIn, e o que isso muda na sua campanha.' },
      { name: 'Mercado', line: 'Campanhas, contas e movimentos de marcas e agências, sem o mesmo release repetido.' },
      { name: 'IA no marketing', line: 'Ferramentas e anúncios com IA, e como a busca feita por IA muda o SEO.' },
    ],
  },
  {
    id: 'imoveis',
    label: 'Imóveis',
    path: '/imoveis',
    status: 'soon',
    cadence: 'Todo dia às 5h',
    audience: 'Para corretores, imobiliárias e incorporadoras',
    pitch:
      'Juros, crédito, lançamentos e proptechs, num resumo neutro do dia, com os números do mercado ao lado. Com o link da fonte e o porquê de cada notícia importar.',
    sections: [
      { name: 'Mercado e crédito', line: 'Juros, financiamento, Minha Casa Minha Vida e regras novas.' },
      { name: 'Empresas e FIIs', line: 'Lançamentos e resultados das incorporadoras, e o que os fundos imobiliários fizeram.' },
      { name: 'Proptech e IA', line: 'Tecnologia e IA para quem vende, aluga e constrói.' },
    ],
  },
  {
    id: 'ux',
    label: 'UX',
    path: '/ux',
    status: 'soon',
    cadence: 'Uma vez por semana',
    audience: 'Para designers, PMs e devs front-end',
    pitch:
      'As novidades das ferramentas de design com IA e o melhor da semana em UX, numa edição só. Com o link da fonte e o porquê de cada notícia importar.',
    sections: [
      { name: 'Ferramentas', line: 'O que saiu no Figma e nas ferramentas de design com IA.' },
      { name: 'Mercado', line: 'Empresas, vagas e eventos de design de produto.' },
      { name: 'Achados', line: 'O melhor da pesquisa em UX da semana, de fora e do Brasil.' },
    ],
  },
];

// E-mail shown in the waitlist's privacy notice, for people who want to leave the list or have
// their data deleted (LGPD). While it is null the waitlist stays closed: the pages say it opens
// soon and the server refuses sign-ups.
export const PRIVACY_CONTACT = null;

/** The niche a page path belongs to ("/marketing/" → marketing), or null. */
export function nicheForPath(pathname) {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return NICHES.find((niche) => niche.path === clean || (niche.path === '/' && clean === '/index.html')) ?? null;
}
