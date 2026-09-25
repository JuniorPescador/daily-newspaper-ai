const TIME_ZONE = 'America/Sao_Paulo';
const EDITION_ID = /^\d{4}-\d{2}-\d{2}-\d{2}h$/;
const CATEGORY_LABEL = { novidades: 'Novidades', mercado: 'Mercado', achados: 'Achados' };
const ARCHIVE_SHOWN = 12;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const $ = (selector) => document.querySelector(selector);
const state = { filter: 'all', onlyNew: false };

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

function ago(iso, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ontem' : `há ${days} dias`;
}

function duration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}min` : `${minutes} min`;
}

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
  return el(
    'ul',
    { class: 'sources', 'aria-label': 'Fontes' },
    story.sources
      .map((source) => {
        const href = safeHref(source.url);
        if (!href) return null;
        return el('li', {}, el('a', { href, target: '_blank', rel: 'noopener noreferrer', title: source.title }, [source.name, arrowIcon()]));
      })
      .filter(Boolean),
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
    sourcesList(story),
  ];
  if (lead) return children;
  const node = el('article', { class: 'story', 'data-category': story.category, 'data-new': String(Boolean(story.isNew)) }, children);
  node.style.viewTransitionName = `story-${story.id}`;
  return node;
}

function renderMasthead(edition) {
  $('#today').textContent = capitalize(longDate.format(new Date(edition.generatedAt)));
  $('#edition-label').textContent = edition.label;
  $('#edition-number').textContent = `Nº ${edition.number} · ${edition.stories.length} notícias`;
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
  track.style.setProperty('--ticker-duration', `${Math.max(40, stories.length * 7)}s`);
}

function renderEditorial(edition) {
  const node = $('#editorial');
  const text = edition.editorial || edition.note;
  node.textContent = text ?? '';
  node.hidden = !text;
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

function applyFilters(animate) {
  const grid = $('#stories');
  const update = () => {
    let visible = 0;
    for (const node of grid.children) {
      const show = (state.filter === 'all' || node.dataset.category === state.filter) && (!state.onlyNew || node.dataset.new === 'true');
      node.hidden = !show;
      if (show) visible += 1;
    }
    $('#empty').hidden = visible > 0;
  };
  if (animate && document.startViewTransition && !reducedMotion.matches) document.startViewTransition(update);
  else update();
}

function setupControls(stories, showNew) {
  const counts = { all: stories.length, novidades: 0, mercado: 0, achados: 0 };
  for (const story of stories) counts[story.category] = (counts[story.category] ?? 0) + 1;
  for (const [key, count] of Object.entries(counts)) {
    const sup = document.querySelector(`sup[data-count="${key}"]`);
    if (sup) sup.textContent = count;
  }

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
  const newCount = stories.filter((story) => story.isNew).length;
  $('#new-count').textContent = newCount;
  onlyNew.closest('.only-new').hidden = !showNew;
  onlyNew.addEventListener('change', () => {
    state.onlyNew = onlyNew.checked;
    applyFilters(true);
  });

  moveIndicator();
  document.fonts?.ready.then(moveIndicator);
  window.addEventListener('resize', moveIndicator);
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
  $('#footer-sources').textContent = `${curation} Fontes com notícias nesta edição (${ok.length} de ${edition.stats.sources}): ${ok.join(', ')}.`;
}

function renderNotice(title, body) {
  $('#lead').closest('.front').hidden = true;
  $('#controls').hidden = true;
  $('.ticker').hidden = true;
  $('#status-text').textContent = 'Sem edição publicada';
  $('#status').classList.add('is-stale');
  $('#stories').replaceChildren(el('div', { class: 'notice' }, [el('h2', { text: title }), el('p', { text: body })]));
}

function render(edition, index, isLatest) {
  const [lead, ...rest] = edition.stories;
  const newCount = edition.stories.filter((story) => story.isNew).length;
  // When everything (or nothing) is new, the badges carry no information.
  const showNew = isLatest && newCount > 0 && newCount < edition.stories.length;

  renderMasthead(edition);
  renderStatus(edition, isLatest);
  renderTicker(edition.stories);
  renderEditorial(edition);
  renderTrends(edition.trends ?? []);

  const leadNode = $('#lead');
  leadNode.removeAttribute('aria-busy');
  leadNode.replaceChildren(...storyNode(lead, { lead: true, showNew }).filter(Boolean));
  reveal(leadNode);

  const grid = $('#stories');
  grid.replaceChildren(...rest.map((story, position) => storyNode(story, { index: position + 2, showNew })));
  for (const node of grid.children) reveal(node);

  setupControls(rest, showNew);
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

  const requested = new URLSearchParams(window.location.search).get('e');
  const id = requested && EDITION_ID.test(requested) ? requested : null;
  const [edition, index] = await Promise.all([
    loadJson(id ? `data/editions/${id}.json` : 'data/latest.json').catch(() => null),
    loadJson('data/editions/index.json').catch(() => []),
  ]);

  if (!edition?.stories?.length) {
    renderNotice(
      id ? 'Edição não encontrada' : 'A primeira edição está a caminho',
      id ? 'Ela pode ter saído do arquivo. Veja a edição mais recente.' : 'O jornal é gerado a cada 6 horas. Volte daqui a pouco.',
    );
    return;
  }
  render(edition, Array.isArray(index) ? index : [], !id || index[0]?.id === id);
}

main();
