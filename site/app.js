import { readingMinutes } from './reading-time.js';
import { ago, duration } from './relative-time.js';

const TIME_ZONE = 'America/Sao_Paulo';
const EDITION_ID = /^\d{4}-\d{2}-\d{2}-\d{2}h$/;
const CATEGORY_LABEL = { novidades: 'Novidades', mercado: 'Mercado', achados: 'Achados' };
const ARCHIVE_SHOWN = 12;
const PERIOD_LABEL = { daily: 'hoje', weekly: 'na semana', monthly: 'no mês' };
// Hugging Face pipeline tags, in plain words; anything else shows as the tag itself.
const TASK_LABEL = {
  'text-generation': 'gera texto',
  'image-text-to-text': 'visão e texto',
  'audio-text-to-text': 'áudio e texto',
  'any-to-any': 'multimodal',
  'text-to-image': 'gera imagem',
  'image-to-image': 'edita imagem',
  'text-to-video': 'gera vídeo',
  'image-to-video': 'imagem para vídeo',
  'text-to-speech': 'gera voz',
  'text-to-audio': 'gera áudio',
  'automatic-speech-recognition': 'transcreve fala',
  'feature-extraction': 'embeddings',
  'sentence-similarity': 'embeddings',
  'text-classification': 'classifica texto',
  'text-ranking': 'ranqueia textos',
  'image-classification': 'classifica imagem',
  'object-detection': 'detecta objetos',
  robotics: 'robótica',
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const $ = (selector) => document.querySelector(selector);
const state = { filter: 'all', onlyNew: false, ai: null };
let aiMeta = new Map();

document.documentElement.classList.add('js');

/* ---------- small helpers ---------- */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function safeHref(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function arrowIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M2 8 8 2M3.5 2H8v4.5');
  svg.append(path);
  return svg;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const longDate = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, weekday: 'short', day: '2-digit', month: 'short' });
const fullDateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, dateStyle: 'long', timeStyle: 'short' });
const compactNumber = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const plainNumber = new Intl.NumberFormat('pt-BR');

async function loadJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/* ---------- chrome: theme, progress, top bar ---------- */

function setupTheme() {
  const toggle = $('#theme-toggle');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  toggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme ?? (systemDark.matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // storage unavailable: the choice lasts for this visit only
    }
  });
}

function setupScrollEffects() {
  const bar = $('.progress span');
  const topbar = $('.topbar');
  let queued = false;
  const update = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.setProperty('--progress', max > 0 ? Math.min(1, window.scrollY / max) : 0);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  new IntersectionObserver(([entry]) => topbar.classList.toggle('is-scrolled', !entry.isIntersecting), {
    rootMargin: '-56px 0px 0px 0px',
  }).observe($('.masthead__title'));
}

const revealer =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          entries
            .filter((entry) => entry.isIntersecting)
            .forEach((entry, order) => {
              entry.target.style.setProperty('--i', order);
              entry.target.classList.add('is-in');
              revealer.unobserve(entry.target);
            });
        },
        { rootMargin: '0px 0px -6% 0px' },
      )
    : null;

function reveal(node) {
  if (!revealer || reducedMotion.matches) return;
  node.classList.add('reveal');
  revealer.observe(node);
}

/* ---------- rendering ---------- */

function sourcesList(story) {
  // One chip per outlet: sources come ordered by relevance, so the first link of each outlet wins.
  const outlets = new Map();
  for (const source of story.sources) {
    const href = safeHref(source.url);
    if (href && !outlets.has(source.name)) outlets.set(source.name, { ...source, href });
  }
  return el(
    'ul',
    { class: 'sources', 'aria-label': 'Fontes' },
    [...outlets.values()].map((source) =>
      el('li', {}, el('a', { href: source.href, target: '_blank', rel: 'noopener noreferrer', title: source.title }, [source.name, arrowIcon()])),
    ),
  );
}

/** Brand logo as a CSS mask (tinted via currentColor); falls back to the initial or a dot. */
function aiIcon(ai, className, fallback = 'letter') {
  if (!ai.logo) {
    return el('span', { class: className, 'aria-hidden': 'true', text: fallback === 'letter' ? ai.label.charAt(0) : null });
  }
  const icon = el('span', { class: `${className} logo-mask`, 'aria-hidden': 'true' });
  const url = `url("logos/${encodeURIComponent(ai.logo)}.svg")`;
  icon.style.webkitMaskImage = url;
  icon.style.maskImage = url;
  return icon;
}

function aiBadges(story) {
  const known = (story.ais ?? []).filter((id) => aiMeta.has(id));
  if (known.length === 0) return null;
  return el(
    'div',
    { class: 'ai-badges' },
    known.map((id) => {
      const ai = aiMeta.get(id);
      const badge = el('button', { type: 'button', class: 'ai-badge', 'data-ai': id, 'aria-pressed': 'false', 'aria-label': `Filtrar por ${ai.label}` }, [
        aiIcon(ai, 'ai-badge__icon', 'dot'),
        ai.label,
      ]);
      badge.style.setProperty('--ai', ai.color);
      return badge;
    }),
  );
}

function storyNode(story, { index, lead = false, showNew }) {
  const href = safeHref(story.sources[0]?.url);
  const headline = href ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: story.title }) : story.title;
  const meta = el('div', { class: 'story__meta' }, [
    lead ? el('span', { class: 'story__index', text: 'Manchete' }) : el('span', { class: 'story__index', text: String(index).padStart(2, '0') }),
    el('span', { class: `cat cat--${story.category}`, text: CATEGORY_LABEL[story.category] ?? story.category }),
    showNew && story.isNew ? el('span', { class: 'badge-new', text: 'Novo' }) : null,
    el('time', { class: 'story__time', datetime: story.publishedAt, title: fullDateTime.format(new Date(story.publishedAt)), text: ago(story.publishedAt) }),
  ]);
  const why = story.whyItMatters
    ? el('p', { class: 'story__why' }, [el('span', { text: 'Por que importa' }), el('span', { text: story.whyItMatters })])
    : null;
  const children = [
    meta,
    el(lead ? 'h2' : 'h3', { class: lead ? 'lead__title' : 'story__title' }, headline),
    story.summary ? el('p', { class: lead ? 'lead__summary' : 'story__summary', text: story.summary }) : null,
    why,
    aiBadges(story),
    sourcesList(story),
  ];
  if (lead) return children;
  const node = el(
    'article',
    {
      class: 'story',
      'data-story': story.id,
      'data-category': story.category,
      'data-new': String(Boolean(story.isNew)),
      'data-ais': (story.ais ?? []).join(' '),
      // The lead is already featured above; it joins the grid only while a filter is on.
      'data-lead': index === 1 ? 'true' : null,
    },
    children,
  );
  node.style.viewTransitionName = `story-${story.id}`;
  return node;
}

/** One line in "Rápidas": category, headline linked to the first source, then outlets and time. */
function quickNode(story, { showNew }) {
  const href = safeHref(story.sources[0]?.url);
  const outlets = [...new Set(story.sources.map((source) => source.name))];
  return el(
    'li',
    {
      class: 'quick__item',
      'data-story': story.id,
      'data-category': story.category,
      'data-new': String(Boolean(story.isNew)),
      'data-ais': (story.ais ?? []).join(' '),
    },
    [
      el('span', { class: `cat cat--${story.category}`, text: CATEGORY_LABEL[story.category] ?? story.category }),
      el('p', { class: 'quick__title' }, [
        href ? el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, [story.title, arrowIcon()]) : story.title,
      ]),
      el('p', { class: 'quick__meta' }, [
        showNew && story.isNew ? el('span', { class: 'badge-new', text: 'Novo' }) : null,
        el('span', { text: outlets.join(', ') }),
        el('time', { datetime: story.publishedAt, title: fullDateTime.format(new Date(story.publishedAt)), text: ago(story.publishedAt) }),
      ]),
    ],
  );
}

function renderMasthead(edition) {
  $('#today').textContent = capitalize(longDate.format(new Date(edition.generatedAt)));
  $('#edition-label').textContent = edition.label;
  $('#edition-number').textContent = `Nº ${edition.number} · ${edition.stories.length} notícias`;
  const reading = $('#reading-time');
  reading.textContent = `Leitura: ~${readingMinutes(edition)} min`;
  reading.title = 'Tempo estimado para ler os resumos desta edição, a 200 palavras por minuto';
  document.title = `Diário da IA · ${edition.label}`;
}

function renderStatus(edition, isLatest) {
  const status = $('#status');
  const text = $('#status-text');
  const tick = () => {
    const now = Date.now();
    if (!isLatest) {
      text.textContent = `Edição arquivada · publicada ${ago(edition.generatedAt, now)}`;
      status.classList.add('is-stale');
      return;
    }
    const untilNext = new Date(edition.nextUpdateAt).getTime() - now;
    const updated = `Atualizado ${ago(edition.generatedAt, now)}`;
    if (untilNext > 0) text.textContent = `${updated} · próxima em ${duration(untilNext)}`;
    else text.textContent = `${updated} · nova edição a caminho`;
    status.classList.toggle('is-stale', untilNext < -90 * 60_000);
  };
  tick();
  setInterval(tick, 60_000);
}

function renderTicker(stories) {
  const track = $('#ticker');
  const items = stories.map((story) => el('span', { class: 'ticker__item', text: story.title }));
  // Two copies make the -50% loop seamless.
  track.replaceChildren(...items, ...items.map((item) => item.cloneNode(true)));
  track.style.setProperty('--ticker-duration', `${Math.max(60, stories.length * 10)}s`);
}

function renderEditorial(edition) {
  const node = $('#editorial');
  const text = edition.editorial || edition.note;
  node.textContent = text ?? '';
  node.hidden = !text;
}

/** "Hoje na edição": one button per highlight, jumping to its story. */
function renderOverview(edition) {
  const known = new Set(edition.stories.map((story) => story.id));
  const lines = (edition.highlights ?? []).filter((line) => known.has(line.storyId));
  $('#overview-list').replaceChildren(
    ...lines.map((line, position) =>
      el(
        'li',
        {},
        el('button', { type: 'button', class: 'overview__item', 'data-target': line.storyId }, [
          el('span', { class: 'overview__num', 'aria-hidden': 'true', text: String(position + 1).padStart(2, '0') }),
          el('span', { class: 'overview__text', text: line.text }),
        ]),
      ),
    ),
  );
  $('#overview').hidden = lines.length === 0;
}

function renderTrends(trends) {
  const list = $('#trends');
  list.replaceChildren(
    ...trends.map((trend) =>
      el('li', { class: 'trends__item' }, [el('span', { class: 'trends__label', text: trend.label }), el('span', { class: 'trends__note', text: trend.note })]),
    ),
  );
  list.closest('.trends').hidden = trends.length === 0;
}

function moveIndicator() {
  const active = document.querySelector('.filter[aria-pressed="true"]');
  const indicator = $('.filters__indicator');
  if (!active) return;
  indicator.style.setProperty('--x', `${active.offsetLeft}px`);
  indicator.style.setProperty('--width', `${active.offsetWidth}px`);
}

function matches(node, { category = state.filter, onlyNew = state.onlyNew, ai = state.ai } = {}) {
  return (
    (category === 'all' || node.dataset.category === category) &&
    (!onlyNew || node.dataset.new === 'true') &&
    (!ai || node.dataset.ais.split(' ').includes(ai))
  );
}

/** Every filterable story: the cards in the grid and the lines in "Rápidas". */
function storyNodes() {
  return [...$('#stories').children, ...$('#quick-list').children];
}

function filtersActive() {
  return state.filter !== 'all' || state.onlyNew || Boolean(state.ai);
}

/** Counts on each control reflect the other active filters. */
function updateCounts() {
  const nodes = storyNodes();
  for (const sup of document.querySelectorAll('sup[data-count]')) {
    sup.textContent = nodes.filter((node) => matches(node, { category: sup.dataset.count })).length;
  }
  $('#new-count').textContent = nodes.filter((node) => matches(node, { onlyNew: true })).length;
}

/** Applies the current filters; resolves once any transition has finished. */
function applyFilters(animate) {
  const update = () => {
    const active = filtersActive();
    let visible = 0;
    let quick = 0;
    for (const node of storyNodes()) {
      const show = matches(node) && (active || node.dataset.lead !== 'true');
      node.hidden = !show;
      if (show) visible += 1;
      if (show && node.classList.contains('quick__item')) quick += 1;
    }
    $('#empty').hidden = visible > 0;
    $('#quick').hidden = quick === 0;
    updateCounts();
  };
  if (animate && document.startViewTransition && !reducedMotion.matches) {
    return document.startViewTransition(update).finished.catch(() => {});
  }
  update();
  return Promise.resolve();
}

/** Back to the whole edition: every category, old and new stories, no AI. */
function clearFilters() {
  state.filter = 'all';
  state.onlyNew = false;
  state.ai = null;
  document.querySelectorAll('.filter').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === 'all')));
  $('#only-new').checked = false;
  moveIndicator();
  syncAiUi();
  return applyFilters(false);
}

/** The story as shown right now: the lead, a card in the grid or a line in "Rápidas". */
function visibleStory(id) {
  return [...document.querySelectorAll(`[data-story="${CSS.escape(id)}"]`)].find((node) => !node.hidden && node.offsetParent !== null);
}

/** Scrolls to a story and flashes it, clearing the filters first when they hide it. */
async function goToStory(id) {
  if (!visibleStory(id)) await clearFilters();
  const target = visibleStory(id);
  if (!target) return;
  target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
  target.classList.remove('fx-flash');
  void target.offsetWidth;
  target.classList.add('fx-flash');
}

function scrollToStories() {
  const topbar = $('.topbar').offsetHeight;
  const top = $('#stories').getBoundingClientRect().top + window.scrollY - topbar - $('#controls').offsetHeight - 8;
  if (Math.abs(top - window.scrollY) > 40) window.scrollTo({ top, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

function syncAiUi() {
  const ai = state.ai ? aiMeta.get(state.ai) : null;
  $('#ai-cards').classList.toggle('has-active', Boolean(ai));
  for (const control of document.querySelectorAll('.ai-card, .ai-badge')) {
    control.setAttribute('aria-pressed', String(control.dataset.ai === state.ai));
  }
  const pill = $('#active-ai');
  pill.hidden = !ai;
  if (ai) {
    pill.style.setProperty('--ai', ai.color);
    pill.querySelector('.active-ai__icon').replaceWith(aiIcon(ai, 'active-ai__icon', 'dot'));
    $('#active-ai-label').textContent = ai.label;
  }

  // The whole page takes the selected AI's color (see :root[data-ai] in styles.css).
  const root = document.documentElement;
  if (ai) {
    root.style.setProperty('--ai-color', ai.color);
    root.dataset.ai = ai.id;
  } else {
    delete root.dataset.ai;
  }
  const url = new URL(window.location.href);
  if (ai) url.searchParams.set('ia', ai.id);
  else url.searchParams.delete('ia');
  try {
    window.history.replaceState(null, '', url);
  } catch {
    // Some embedded viewers refuse history changes; the filter still works, only the link isn't updated.
  }
}

/** Selects an AI (or clears it when it is already selected). */
function toggleAi(id, { scroll = false } = {}) {
  state.ai = state.ai === id || !aiMeta.has(id) ? null : id;
  syncAiUi();
  applyFilters(true).then(() => {
    if (scroll && state.ai) scrollToStories();
  });
}

function renderAiFilter(ais) {
  const section = $('#ai-filter');
  section.hidden = ais.length === 0;
  $('#ai-cards').replaceChildren(
    ...ais.map((ai) => {
      const card = el('button', { type: 'button', class: 'ai-card', 'data-ai': ai.id, 'aria-pressed': 'false', title: `Ver só notícias sobre ${ai.label}` }, [
        el('span', { class: 'ai-card__mark', 'aria-hidden': 'true' }, aiIcon(ai, 'ai-card__logo')),
        el('span', { class: 'ai-card__text' }, [el('span', { class: 'ai-card__name', text: ai.label }), el('span', { class: 'ai-card__maker', text: ai.maker })]),
        el('span', { class: 'ai-card__count', 'aria-label': `${ai.count} notícias`, text: ai.count }),
      ]);
      card.style.setProperty('--ai', ai.color);
      return card;
    }),
  );
  if (ais.length) reveal(section);

  // One delegated listener covers the cards, the lead and every story badge.
  document.addEventListener('click', (event) => {
    const control = event.target.closest('.ai-card, .ai-badge');
    if (!control) return;
    const inGrid = Boolean(control.closest('#stories'));
    toggleAi(control.dataset.ai, { scroll: !inGrid });
  });
  $('#active-ai').addEventListener('click', () => toggleAi(state.ai));
}

function setupControls(showNew) {
  for (const button of document.querySelectorAll('.filter')) {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll('.filter').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
      button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      moveIndicator();
      applyFilters(true);
    });
  }

  const onlyNew = $('#only-new');
  onlyNew.closest('.only-new').hidden = !showNew;
  onlyNew.addEventListener('change', () => {
    state.onlyNew = onlyNew.checked;
    applyFilters(true);
  });

  moveIndicator();
  document.fonts?.ready.then(moveIndicator);
  window.addEventListener('resize', moveIndicator);
}

/* ---------- Em alta ---------- */

function slashName(name) {
  const slash = name.indexOf('/');
  return el('span', { class: 'hot__name' }, [el('span', { class: 'hot__owner', text: name.slice(0, slash + 1) }), name.slice(slash + 1)]);
}

/** One ranked entry: link, optional body, then a line of facts. */
function hotItem(url, head, body, facts) {
  const href = safeHref(url);
  if (!href) return null;
  return el('li', { class: 'hot__item' }, [
    el('a', { class: 'hot__link', href, target: '_blank', rel: 'noopener noreferrer' }, [...head, arrowIcon()]),
    ...body,
    el('p', { class: 'hot__meta', text: facts.filter(Boolean).join(' · ') }),
  ]);
}

/** Claude's note in PT-BR; without it, the item's own description (in its original language). */
function hotNote(note, fallback) {
  if (note) return el('p', { class: 'hot__note', text: note });
  return fallback ? el('p', { class: 'hot__note hot__note--raw', text: fallback }) : null;
}

function renderHot(trending) {
  const section = $('#hot');
  section.hidden = !trending;
  if (!trending) return;

  const lists = {
    repos: (trending.repos ?? []).map((repo) =>
      hotItem(repo.url, [slashName(repo.name)], [hotNote(repo.note, repo.description)], [
        repo.language,
        `${compactNumber.format(repo.stars)} estrelas`,
        repo.gained ? `+${plainNumber.format(repo.gained)} ${PERIOD_LABEL[repo.period] ?? ''}`.trim() : null,
      ]),
    ),
    models: (trending.models ?? []).map((model) =>
      hotItem(model.url, [slashName(model.name)], [hotNote(model.note)], [
        TASK_LABEL[model.task] ?? model.task,
        `${compactNumber.format(model.likes)} curtidas`,
        model.downloads ? `${compactNumber.format(model.downloads)} downloads` : null,
      ]),
    ),
    posts: (trending.posts ?? []).map((post) =>
      hotItem(
        post.url,
        [el('span', { class: 'hot__name', text: post.author }), el('span', { class: 'hot__handle', text: `@${post.handle}` })],
        [el('blockquote', { class: 'hot__quote', text: post.text }), hotNote(post.note)],
        [`${compactNumber.format(post.likes)} curtidas`, ago(post.publishedAt)],
      ),
    ),
  };
  for (const [key, items] of Object.entries(lists)) {
    const list = $(`#hot-${key}`);
    list.replaceChildren(...items.filter(Boolean));
    list.closest('.hot__col').hidden = list.children.length === 0;
  }
  if (!trending.curated) $('#hot-hint').append(' Lista automática, sem comentários por IA.');
  for (const column of section.querySelectorAll('.hot__col:not([hidden])')) reveal(column);
}

function renderArchive(index, currentId) {
  const section = $('.archive');
  const entries = index.slice(0, ARCHIVE_SHOWN);
  section.hidden = entries.length < 2;
  $('#archive').replaceChildren(
    ...entries.map((entry, position) => {
      const href = position === 0 ? './' : `?e=${encodeURIComponent(entry.id)}`;
      const when = `${shortDate.format(new Date(entry.generatedAt)).replace(/\./g, '')} · ${entry.label.replace('Edição da ', '')} · nº ${entry.number}`;
      return el(
        'li',
        {},
        el('a', { href, 'aria-current': entry.id === currentId ? 'page' : null }, [
          el('span', { class: 'archive__when', text: when }),
          el('span', { class: 'archive__headline', text: entry.headline }),
        ]),
      );
    }),
  );
}

function renderFooter(edition) {
  const ok = edition.stats.list?.filter((source) => source.ok && source.count > 0).map((source) => source.name) ?? [];
  const curation = edition.curated ? `Curadoria e resumos: ${edition.model}.` : 'Edição automática, sem resumos por IA.';
  const hot = edition.trending?.sources?.filter((source) => source.ok).map((source) => source.name) ?? [];
  const hotText = hot.length ? ` Em alta: ${hot.join(', ')}.` : '';
  $('#footer-sources').textContent = `${curation} Fontes com notícias nesta edição (${ok.length} de ${edition.stats.sources}): ${ok.join(', ')}.${hotText}`;
}

function renderNotice(title, body) {
  $('#lead').closest('.front').hidden = true;
  $('#controls').hidden = true;
  $('.ticker').hidden = true;
  $('#status-text').textContent = 'Sem edição publicada';
  $('#status').classList.add('is-stale');
  $('#stories').replaceChildren(el('div', { class: 'notice' }, [el('h2', { text: title }), el('p', { text: body })]));
}

function render(edition, index, isLatest, requestedAi) {
  // Editions before the "Rápidas" split have no format: every story is a full card.
  const full = edition.stories.filter((story) => story.format !== 'brief');
  const brief = edition.stories.filter((story) => story.format === 'brief');
  const [lead] = full;
  const newCount = edition.stories.filter((story) => story.isNew).length;
  // When everything (or nothing) is new, the badges carry no information.
  const showNew = isLatest && newCount > 0 && newCount < edition.stories.length;

  renderMasthead(edition);
  renderStatus(edition, isLatest);
  renderTicker(edition.stories);
  renderEditorial(edition);
  renderOverview(edition);
  renderTrends(edition.trends ?? []);
  aiMeta = new Map((edition.ais ?? []).map((ai) => [ai.id, ai]));

  const leadNode = $('#lead');
  leadNode.removeAttribute('aria-busy');
  leadNode.dataset.story = lead.id;
  leadNode.replaceChildren(...storyNode(lead, { lead: true, showNew }).filter(Boolean));
  reveal(leadNode);

  const grid = $('#stories');
  grid.replaceChildren(...full.map((story, position) => storyNode(story, { index: position + 1, showNew })));
  for (const node of grid.children) reveal(node);
  const quickList = $('#quick-list');
  quickList.replaceChildren(...brief.map((story) => quickNode(story, { showNew })));
  for (const node of quickList.children) reveal(node);

  renderAiFilter(edition.ais ?? []);
  setupControls(showNew);
  $('#overview-list').addEventListener('click', (event) => {
    const item = event.target.closest('.overview__item');
    if (item) goToStory(item.dataset.target);
  });
  if (requestedAi && aiMeta.has(requestedAi)) state.ai = requestedAi;
  syncAiUi();
  applyFilters(false);
  renderHot(edition.trending);
  renderArchive(index, edition.id);
  renderFooter(edition);

  if (!isLatest) {
    $('#archive-banner-text').textContent = `Você está lendo a ${edition.label.toLowerCase()} de ${longDate.format(new Date(edition.generatedAt))} (nº ${edition.number}).`;
    $('#archive-banner').hidden = false;
  }
}

async function main() {
  setupTheme();
  setupScrollEffects();

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('e');
  const id = requested && EDITION_ID.test(requested) ? requested : null;
  const [edition, index] = await Promise.all([
    loadJson(id ? `data/editions/${id}.json` : 'data/latest.json').catch(() => null),
    loadJson('data/editions/index.json').catch(() => []),
  ]);

  if (!edition?.stories?.length) {
    renderNotice(
      id ? 'Edição não encontrada' : 'A primeira edição está a caminho',
      id ? 'Ela pode ter saído do arquivo. Veja a edição mais recente.' : 'O jornal sai todo dia às 5h da manhã. Volte daqui a pouco.',
    );
    return;
  }
  render(edition, Array.isArray(index) ? index : [], !id || index[0]?.id === id, params.get('ia'));
  import('./fx/index.js')
    .then((fx) => fx.startEffects({ edition }))
    .catch((error) => console.warn('[fx] effects unavailable:', error));
}

main();
