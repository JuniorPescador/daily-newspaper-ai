# Diário da IA

Jornal de notícias sobre inteligência artificial, com novidades, mercado e achados. Toda notícia leva o link da fonte original. Sai uma edição por dia, às 5h da manhã.

## Como funciona

1. **Coleta.** `sources.json` lista cerca de 30 fontes: laboratórios, veículos de tecnologia, newsletters, Hacker News, Hugging Face Papers e veículos brasileiros. Entram só itens das últimas 36 h (72 h para papers). Anúncios e duplicatas saem nessa etapa, e as fontes de assunto geral passam por um filtro de IA.
2. **Curadoria.** O Claude recebe a lista numerada e monta a edição com 14 a 22 notícias. Ele junta coberturas do mesmo fato, escreve título, resumo e "por que importa" em PT-BR, separa em **Novidades / Mercado / Achados** e aponta as tendências. Os links vêm sempre dos feeds: o modelo só escolhe IDs, e IDs inventados são descartados.
3. **Plano B.** Sem `ANTHROPIC_API_KEY`, ou se a API falhar, sai uma edição automática: os títulos e trechos originais, com a categoria definida por palavras-chave.
4. **Publicação.** Todo dia às 05:00 (horário de Brasília), o cron-job.org dispara o workflow do GitHub Actions (veja [Agendamento](#agendamento-pelo-cron-joborg)). Ele salva a edição no branch `data` e publica o site no GitHub Pages. O arquivo guarda cerca de 4 meses de edições.

A página é estática, sem etapa de build: `site/index.html`, `site/styles.css` e `site/app.js`, que lê `data/latest.json`.

**Efeitos.** Uma aurora animada atrás do título assume a cor da IA escolhida. Os cards inclinam com o mouse, e o título tomba para trás ao rolar a página. O "Mapa do dia" mostra, em 3D, as notícias ligadas às IAs que citam. Ao filtrar por uma IA, a logo dela aparece em 3D no fundo. O código fica em `site/fx/`. O mapa e a logo usam Three.js, carregado do jsDelivr só quando a página precisa. Tudo desliga para quem ativou "reduzir movimento" no sistema.

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

## Agendamento pelo cron-job.org

O agendador do GitHub chega a atrasar horas. Por isso, quem dispara a edição às 5h é o [cron-job.org](https://cron-job.org), que é pontual. O agendamento do próprio GitHub fica como reserva: se a edição do dia já saiu, ele não faz nada.

**1. Criar o token no GitHub** (uma vez por ano)

1. Abra [este link](https://github.com/settings/personal-access-tokens/new?name=diario-ia-cron&description=cron-job.org+dispara+a+edicao+diaria+do+Diario+da+IA&target_name=JuniorPescador&expires_in=366&actions=write). Ele já vem com nome, validade de 366 dias e a permissão **Actions: Read and write**.
2. Em **Repository access**, escolha **Only select repositories** e marque `daily-newspaper-ai`.
3. Clique em **Generate token** e copie o token, que começa com `github_pat_`.

**2. Pegar a chave de API do cron-job.org.** Crie uma conta grátis em [cron-job.org](https://cron-job.org). No painel, abra **Settings → API** e crie uma chave.

**3. Criar a tarefa pela API.** No terminal, na pasta do projeto:

```bash
pnpm setup:cron --test
```

O script pede o token do GitHub e a chave do cron-job.org, sem mostrar o que você digita. Ele confere o token no GitHub, cria a tarefa e mostra a próxima execução. Com `--test`, dispara uma edição na hora, igual à do cron, com custo de cerca de US$ 0,11. Se a tarefa já existir, o script atualiza a que já está lá. As credenciais também podem vir das variáveis `GITHUB_DISPATCH_TOKEN` e `CRONJOB_API_KEY`.

<details>
<summary>O que a tarefa faz</summary>

| Campo | Valor |
|---|---|
| URL | `https://api.github.com/repos/JuniorPescador/daily-newspaper-ai/actions/workflows/edition.yml/dispatches` |
| Horário | Todo dia às 05:00, fuso `America/Sao_Paulo` |
| Método | `POST`, corpo `{"ref":"main"}` |
| Cabeçalhos | `Accept: application/vnd.github+json`, `Authorization: Bearer <token>`, `X-GitHub-Api-Version: 2022-11-28`, `Content-Type: application/json`, `User-Agent: diario-ia-cron` |
| Avisos | Por e-mail quando falha e quando volta a funcionar |

</details>

**Quando o token vencer**, o cron-job.org passa a receber `401` e avisa por e-mail. Crie um token novo pelo mesmo link e rode `pnpm setup:cron` de novo: ele troca o token na tarefa existente. Enquanto isso, o agendamento de reserva do GitHub continua gerando a edição, só que mais tarde.

## Custo estimado da IA

Cada edição envia cerca de 12 mil tokens (as ~120 notícias candidatas) e recebe de 5 a 9 mil. É 1 edição por dia:

| Modelo | Por edição | Por mês |
|---|---|---|
| `claude-sonnet-5` (padrão) | ~US$ 0,10 | ~US$ 3–4 |
| `claude-opus-5` | ~US$ 0,25 | ~US$ 6–9 |
| `claude-haiku-4-5` | ~US$ 0,04 | ~US$ 1 |

O consumo real de cada edição fica em `usage`, dentro do JSON da edição.

## Limitações

- O agendador do GitHub já atrasou quase 6 horas. Por isso a edição é disparada pelo cron-job.org, e o agendamento do GitHub é só reserva.
- O GitHub desativa workflows agendados em repositórios públicos sem atividade por 60 dias. Se o jornal parar, reative em **Actions → Edition**.
- Os resumos são gerados por IA e podem conter erros. A página sempre leva à fonte original.
- Algumas fontes bloqueiam robôs ou mudam o endereço do feed. Quando uma fonte falha, a edição sai sem ela e o erro aparece no log do workflow.
