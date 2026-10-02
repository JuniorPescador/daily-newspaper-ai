# Gazeta Neural

Jornal de notícias sobre inteligência artificial, com novidades, mercado e achados. Toda notícia leva o link da fonte original. Sai uma edição por dia, às 5h da manhã, em https://web-production-79215.up.railway.app/.

## Como funciona

1. **Coleta.** `sources.json` lista cerca de 30 fontes: laboratórios, veículos de tecnologia, newsletters, Hacker News, Hugging Face Papers e veículos brasileiros. Entram só itens das últimas 36 h (72 h para papers). Anúncios e duplicatas saem nessa etapa, e as fontes de assunto geral passam por um filtro de IA.
2. **Curadoria.** O Claude recebe a lista numerada e monta a edição com 14 a 22 notícias. Ele junta coberturas do mesmo fato, separa em **Novidades / Mercado / Achados** e aponta as tendências. As 6 a 8 notícias mais importantes saem completas, com título, resumo e "por que importa" em PT-BR. As outras vão para as **Rápidas**: só o título, uma linha por notícia. Logo depois da manchete, o **Hoje na edição** resume o dia em 3 a 5 linhas curtas, e cada uma leva à sua notícia. Os links vêm sempre dos feeds: o modelo só escolhe IDs, e IDs inventados são descartados.
3. **Plano B.** Sem `ANTHROPIC_API_KEY`, ou se a API falhar, sai uma edição automática: os títulos e trechos originais, com a categoria definida por palavras-chave. As 7 primeiras saem completas e o resto vai para as Rápidas. O Hoje na edição usa os títulos das 4 primeiras.
4. **Publicação.** O site roda no Railway. O mesmo processo serve a página e gera a edição todo dia às 05:00 (horário de Brasília). As edições ficam num volume do Railway e o arquivo guarda cerca de 4 meses.

A página é estática, sem etapa de build: `site/index.html`, `site/styles.css` e `site/app.js`, que lê `data/latest.json`. Quem serve é o `scripts/start.mjs`. O topo mostra o tempo de leitura da edição, contado no navegador a 200 palavras por minuto (`site/reading-time.js`).

**Manchete.** A notícia mais importante abre a página, como a primeira página de um jornal: título grande, imagem, resumo, "por que importa" e fontes, com as tendências ao lado. O nome e o símbolo do jornal ficam no canto superior esquerdo. A imagem é a de compartilhamento (`og:image`) das páginas de origem da notícia, na ordem das fontes: entra a primeira que existir, com crédito e link para a notícia. Logos e imagens genéricas ficam de fora, e sem imagem a manchete sai só com o título. O código fica em `src/lead-image.mjs`.

**Marca.** O símbolo junta a régua de cabeçalho de jornal com três colunas de pontos ligados, como uma rede neural. O ponto laranja é o nó de saída e o ponto final do nome. As fontes são Instrument Serif (títulos), Instrument Sans (texto) e JetBrains Mono (rótulos).

**Efeitos.** Atrás da manchete, uma rede neural em 3D não para de se mexer: os neurônios vagam devagar e se ligam ao acaso, como sinapses, que nascem, duram alguns segundos e se desfazem. As ligações da frente são mais grossas e fortes, as do fundo mais finas e apagadas, e a rede balança devagar (e com o mouse), então a frente passa por cima do fundo. Sinais correm pelas ligações e acendem os neurônios, e passar o mouse perto de um faz ele disparar. A rede assume a cor da IA escolhida. Os cards inclinam com o mouse. O "Mapa do dia" é a edição como um cérebro em 3D: centenas de pontos formam a superfície, ligados numa malha por onde correm impulsos. Cada notícia é um neurônio aceso na região da sua seção (Novidades na frente, Mercado em cima, Achados atrás), ligado às IAs que cita, que ficam no centro. Partículas ao redor se ligam ao cérebro quando chegam perto. No tema escuro ele brilha em neon; no claro, vira um traço nítido. Ao filtrar por uma IA, a logo dela aparece em 3D no fundo. O código fica em `site/fx/`. O mapa e a logo usam Three.js, carregado do jsDelivr só quando a página precisa. Tudo desliga para quem ativou "reduzir movimento" no sistema.

**Filtro por IA.** Cada notícia recebe selos das IAs citadas (ChatGPT, Claude, Gemini, Llama, Grok, Copilot, Mistral, DeepSeek, Qwen e outras). A lista fica em `src/ais.mjs` e a detecção roda na geração da edição. Clicar num card ou selo mostra só as notícias daquela IA, e o link fica compartilhável (`?ia=claude`).

**Lançamentos de modelos.** Quando uma notícia é o lançamento de um modelo novo de IA, a curadoria marca o nome do modelo e a página mostra um card de destaque, na cor da empresa. Esse tipo de notícia sai sempre completo, nunca nas Rápidas. Nas 2 primeiras notícias desse tipo, uma segunda chamada ao Claude lê o anúncio oficial (busca e leitura de página) e monta uma tabela que compara o modelo novo com até 3 rivais: benchmarks, preço e contexto. Só entram números da página lida, e a tabela leva o link dela. Se não houver números suficientes, o card sai sem tabela. O código fica em `src/compare.mjs`.

**Em alta.** Depois das notícias, uma seção mostra o que a comunidade de IA está construindo e discutindo. São três colunas com até 5 itens cada:

- **Repositórios:** projetos de IA do [GitHub Trending](https://github.com/trending), primeiro os do dia e, para completar, os da semana. Não existe API oficial para essa lista, então o script lê a página.
- **Modelos:** modelos em alta no Hugging Face. Ficam de fora cópias quantizadas (GGUF), adaptadores, fusões e conteúdo adulto.
- **Posts:** posts do Bluesky das últimas 36 h, vindos de contas de IA escolhidas a dedo e de um feed público de IA/ML. São ordenados por curtidas e reposts, com no máximo 2 por autor. A busca do Bluesky exige login, por isso a coleta usa contas e feeds, que são públicos.

O Claude escolhe os itens e escreve uma linha em PT-BR sobre cada um, numa chamada separada e com esforço baixo. Sem a chave da API, entram os primeiros de cada lista sem comentário, e os posts vêm só das contas escolhidas. As contas, os feeds e os limites ficam em `trending.json`. Se a coleta falhar, a edição sai sem a seção.

## Rodar localmente

```bash
pnpm install
pnpm edition          # gera data/latest.json (usa a IA se houver chave no .env)
pnpm edition --no-ai  # força a edição automática
pnpm dev              # só a página, em http://localhost:4321
pnpm start            # página + edição diária às 05:00, como no Railway (porta 8080)
pnpm test
```

Para usar a IA localmente, crie um `.env` a partir do `.env.example`.

## Railway

O serviço `web` do projeto **daily-newspaper-ai** roda `node scripts/start.mjs` (definido em `.railway/railway.ts`). Ele faz três coisas:

1. Serve `site/` e as edições (`/data/`), com checagem de saúde em `/healthz`.
2. Gera a edição todo dia às 05:00 de Brasília. O horário fica em `src/time.mjs`.
3. Ao iniciar, gera a edição do dia só se o horário das 05:00 já passou e ela ainda não saiu (por exemplo, se o serviço estava fora do ar).

| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | Liga a curadoria por IA. Sem ela, sai a edição automática. |
| `CLAUDE_MODEL` (opcional) | Troca o modelo. O padrão é `claude-sonnet-5`. |
| `DATA_DIR` | Pasta do volume onde ficam as edições. |
| `PORT` | Definida pelo Railway. |

**Deploy.** Com o serviço ligado ao repositório no GitHub (Settings → Source), todo merge na `main` publica sozinho. Sem essa ligação, publique com `railway up`.

**Configuração do serviço.** Comando de início, checagem de saúde, política de reinício, volume e variáveis ficam em `.railway/railway.ts`. O Railway não lê esse arquivo no deploy. Depois de mudar, rode `railway config plan` para ver o que muda e `railway config apply` para aplicar. O que sair do arquivo é apagado no `apply`. As variáveis aparecem como `preserve()`: o valor fica guardado no Railway, fora do git.

**Gerar uma edição fora do horário.** Abra um terminal no serviço com `railway ssh` e rode `node scripts/edition.mjs`.

## Custo estimado da IA

Cada edição envia cerca de 12 mil tokens (as ~120 notícias candidatas) e recebe de 5 a 9 mil. É 1 edição por dia:

| Modelo | Por edição | Por mês |
|---|---|---|
| `claude-sonnet-5` (padrão) | ~US$ 0,10 | ~US$ 3–4 |
| `claude-opus-5` | ~US$ 0,25 | ~US$ 6–9 |
| `claude-haiku-4-5` | ~US$ 0,04 | ~US$ 1 |

O consumo real de cada edição fica em `usage`, dentro do JSON da edição.

A seção "Em alta" faz uma chamada a mais, bem menor: cerca de 4 mil tokens de entrada e até 2 mil de saída. Com o `claude-sonnet-5`, isso dá uns US$ 0,02 por edição, perto de US$ 0,70 por mês. O consumo fica em `trending.usage`.

Nos dias com lançamento de modelo, cada comparativo é uma chamada extra com busca e leitura de páginas (no máximo 2 por edição). O consumo dela fica em `usage.comparisons`.

## Limitações

- As edições ficam no volume do Railway. Se o volume for apagado, o arquivo de edições se perde. As edições de 25 a 28/09 geradas pelo GitHub continuam guardadas no branch `data`.
- Os resumos são gerados por IA e podem conter erros. A página sempre leva à fonte original.
- Algumas fontes bloqueiam robôs ou mudam o endereço do feed. Quando uma fonte falha, a edição sai sem ela e o erro aparece nos logs do Railway.
