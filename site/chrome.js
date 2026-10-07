// Page chrome shared by the edition (app.js) and the "em breve" tabs (soon.js): theme toggle and
// the row of section tabs.
import { NICHES } from './niches.js';

export function setupTheme() {
  const toggle = document.querySelector('#theme-toggle');
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

/** One link per section; the open one is marked, the ones still to come say "em breve". */
export function renderTabs(nav, activeId) {
  const items = NICHES.map((niche) => {
    const link = document.createElement('a');
    link.className = 'niches__tab';
    link.href = niche.path;
    link.textContent = niche.label;
    if (niche.id === activeId) link.setAttribute('aria-current', 'page');
    if (niche.status === 'soon') {
      const tag = document.createElement('span');
      tag.className = 'niches__soon';
      tag.textContent = 'em breve';
      // The space is not drawn (flex), but screen readers hear "Marketing em breve".
      link.append(' ', tag);
    }
    const item = document.createElement('li');
    item.append(link);
    return item;
  });
  const list = document.createElement('ul');
  list.className = 'niches__list';
  list.append(...items);
  nav.replaceChildren(list);
}
