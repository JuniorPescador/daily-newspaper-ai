# Diário da IA

Jornal de notícias sobre inteligência artificial, com novidades, mercado e achados. Toda notícia leva o link da fonte original. Sai uma edição por dia, às 5h da manhã.

## Como funciona

1. **Coleta.** `sources.json` lista cerca de 30 fontes: laboratórios, veículos de tecnologia, newsletters, Hacker News, Hugging Face Papers e veículos brasileiros. Entram só itens das últimas 36 h (72 h para papers). Anúncios e duplicatas saem nessa etapa, e as fontes de assunto geral passam por um filtro de IA.
2. **Curadoria.** O Claude recebe a lista numerada e monta a edição com 14 a 22 notícias. Ele junta coberturas do mesmo fato, escreve título, resumo e "por que importa" em PT-BR, separa em **Novidades / Mercado / Achados** e aponta as tendências. Os links vêm sempre dos feeds: o modelo só escolhe IDs, e IDs inventados são descartados.
3. **Plano B.** Sem `ANTHROPIC_API_KEY`, ou se a API falhar, sai uma edição automática: os títulos e trechos originais, com a categoria definida por palavras-chave.
4. **Publicação.** O GitHub Actions roda todo dia às 05:17 (horário de Brasília). Ele salva a edição no branch `data` e publica o site no GitHub Pages. O arquivo guarda cerca de 4 meses de edições.

A página é estática, sem etapa de build: `site/index.html`, `site/styles.css` e `site/app.js`, que lê `data/latest.json`.

**Filtro por IA.** Cada notícia recebe selos das IAs citadas (ChatGPT, Claude, Gemini, Llama, Grok, Copilot, Mistral, DeepSeek, Qwen e outras). A lista fica em `src/ais.mjs` e a detecção roda na geração da edição. Clicar num card ou selo mostra só as notícias daquela IA, e o link fica compartilhável (`?ia=claude`).

## Rodar localmente

```bash
pnpm install
pnpm edition          # gera data/latest.json (usa a IA se houver chave no .env)
pnpm edition --no-ai  # força a edição automática
pnpm dev              # http://localhost:4321
pnpm test
```

Para usar a IA localmente, crie um `.env` a partir do `.env.example`.

## Configuração no GitHub

| O quê | Onde | Para quê |
|---|---|---|
| `ANTHROPIC_API_KEY` | Settings → Secrets and variables → Actions → Secrets | Liga a curadoria por IA. Sem ela, sai a edição automática. |
| `CLAUDE_MODEL` (opcional) | Settings → Secrets and variables → Actions → Variables | Troca o modelo. O padrão é `claude-sonnet-5`. |
| Pages | Settings → Pages → Source: **GitHub Actions** | Publica o site. |

Para gerar uma edição fora do horário, use **Actions → Edition → Run workflow**.

## Custo estimado da IA

Cada edição envia cerca de 12 mil tokens (as ~120 notícias candidatas) e recebe de 5 a 9 mil. É 1 edição por dia:

| Modelo | Por edição | Por mês |
|---|---|---|
| `claude-sonnet-5` (padrão) | ~US$ 0,10 | ~US$ 3–4 |
| `claude-opus-5` | ~US$ 0,25 | ~US$ 6–9 |
| `claude-haiku-4-5` | ~US$ 0,04 | ~US$ 1 |

O consumo real de cada edição fica em `usage`, dentro do JSON da edição.

## Limitações

- O GitHub pode atrasar execuções agendadas em horários de pico (já passou de 2 horas). Por isso o jornal é agendado para as 5h: na maioria dos dias, a edição fica pronta antes das 6h.
- O GitHub desativa workflows agendados em repositórios públicos sem atividade por 60 dias. Se o jornal parar, reative em **Actions → Edition**.
- Os resumos são gerados por IA e podem conter erros. A página sempre leva à fonte original.
- Algumas fontes bloqueiam robôs ou mudam o endereço do feed. Quando uma fonte falha, a edição sai sem ela e o erro aparece no log do workflow.
