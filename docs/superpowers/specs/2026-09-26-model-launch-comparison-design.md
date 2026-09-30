# Model launch highlight + comparison table

Issue: JuniorPescador/daily-newspaper-ai#13 · Task: FEAT-005 · Status: approved 2026-09-26

## Goal

A story about the launch of a new AI model gets a visual highlight, and, when the
announcement publishes numbers, a table comparing the new model with up to three rivals
(e.g. Claude Opus 5.5 vs Claude Fable 5.1 vs GPT Astra).

## Decisions

| Question | Decision | Why |
|---|---|---|
| Table or image | HTML table with inline bars | Themes (light/dark), mobile, copyable numbers, no image pipeline |
| Where numbers come from | A second Claude call per launch reads the official announcement (web fetch + web search) | Labs publish comparison tables at launch; RSS snippets almost never carry benchmarks; a hand-kept registry goes stale |
| How the call returns data | A client tool `report_comparison` (not `output_config.format`) | Structured outputs are incompatible with citations, which web search may produce; a tool call works with server tools on every model |
| Rivals | The ones the announcement compares against, up to 3 | The page only has numbers for those |

## Data flow

1. **Curation** (`src/curate.mjs`): each story gains two required strings, `launch_model` and
   `launch_maker`, empty unless the story is the release of a new AI model.
2. **Assembly** (`src/edition.mjs` `buildStories`): non-empty `launch_model` becomes
   `story.launch = { model, maker, ai }`, where `ai` is the id from `src/ais.mjs` detected in
   the model/maker names (or `null`).
3. **Comparison** (`src/compare.mjs`, called from `scripts/edition.mjs` only for curated
   editions): for the first 2 launch stories, one request with `web_search` (max 3 uses),
   `web_fetch` (max 3 uses, ~20k tokens per page) and `report_comparison`. `pause_turn` is resumed up to 3 times.
   The validated result is stored as `story.launch.comparison`; tokens are added to
   `edition.usage`.

```json
"launch": {
  "model": "Claude Opus 5.5",
  "maker": "Anthropic",
  "ai": "claude",
  "comparison": {
    "models": ["Claude Opus 5.5", "Claude Fable 5.1", "GPT Astra"],
    "rows": [
      { "label": "SWE-bench Verified", "unit": "%", "better": "higher", "values": [81.2, 84, 78.1] },
      { "label": "Preço de entrada (por 1M tokens)", "unit": "usd", "better": "lower", "values": [4, 10, null] },
      { "label": "Janela de contexto", "unit": "tokens", "better": "higher", "values": [1000000, 1000000, null] }
    ],
    "source": { "name": "Anthropic", "url": "https://www.anthropic.com/news/claude-opus-5-5" }
  }
}
```

## Validation (`validateComparison`, pure)

Nothing from the model is trusted:

- `source.url` must be a page successfully fetched in that same response
  (`web_fetch_tool_result` blocks); otherwise no table.
- 2-4 models, the first one is the new model; names cleaned and capped at 40 chars.
- Rows: `unit` in `%`, `usd`, `tokens`, `''`; `better` in `higher`, `lower`; `values` must have
  one finite number or `null` per model; `%` values within 0-100; negative values rejected;
  a row needs a value for the new model and at least one rival. Max 6 rows.
- Fewer than 2 valid rows → no table (the launch highlight stays).

## Failure handling

Any error in the comparison (API error, refusal, no tool call, invalid data) is logged and
the story keeps `launch` without `comparison`. The edition is never blocked. Fallback
editions (no API key) never set `launch`.

## Page (`site/app.js`, `site/styles.css`)

- `story--launch`: spans the full grid width, top border and kicker in the maker's color
  (`aiMeta` color, else the accent), "Lançamento" pill, model name in large serif.
- The lead gets the same treatment when the lead is a launch.
- Table: caption "Como se compara"; the new model's column is tinted; the best value per row
  is bold; `%` rows show a bar; numbers formatted in pt-BR (`81,3%`, `US$ 4,00`, `1 mi`).
  A wrapper scrolls horizontally on narrow screens.
- Footnote: "Números divulgados por {source.name}" linking to the source.
- Old editions (no `launch`) render unchanged; no schema version bump (additive field).

## Tests

- `test/compare.test.mjs`: validation rules, fetched-URL extraction, request shape (tools,
  models), `pause_turn` resume, failures returning `null`, `addComparisons` limit and isolation.
- `test/edition.test.mjs`: `launch` set only when `launch_model` is non-empty; missing fields ok.
- `test/curate.test.mjs`: schema requires the launch fields.
- Browser: a sample edition with a launch (lead and grid), light and dark, 375px width.

## Out of scope

Fallback-edition detection, image generation, a "launches only" filter, checking each number
against the page text (the source link lets readers verify).
