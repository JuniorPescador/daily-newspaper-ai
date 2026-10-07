// "Em breve" page for a section that has no edition yet (/marketing, /imoveis, /ux): what it will
// bring, and the "me avise" waitlist, open only once site/niches.js has a privacy contact.
import { renderTabs, setupTheme } from './chrome.js';
import { nicheForPath, PRIVACY_CONTACT } from './niches.js';

const $ = (selector) => document.querySelector(selector);

const ERRORS = {
  email: 'Confira o e-mail: ele parece incompleto.',
  consent: 'Marque a caixa para a gente poder te avisar.',
  'too-many': 'Muitas tentativas seguidas. Tente de novo em alguns minutos.',
  closed: 'A lista de espera ainda não abriu.',
};

function renderNiche(niche) {
  document.title = `Jornal Presenza · ${niche.label} (em breve)`;
  $('#soon-title').textContent = niche.label;
  $('#soon-cadence').textContent = niche.cadence;
  $('#soon-audience').textContent = niche.audience;
  $('#soon-pitch').textContent = niche.pitch;
  $('#soon-sections').replaceChildren(
    ...niche.sections.map((section) => {
      const item = document.createElement('li');
      item.className = 'trends__item';
      const name = document.createElement('span');
      name.className = 'trends__label';
      name.textContent = section.name;
      const line = document.createElement('span');
      line.className = 'trends__note';
      line.textContent = section.line;
      item.append(name, line);
      return item;
    }),
  );
}

function setupWaitlist(niche) {
  if (!PRIVACY_CONTACT) return;
  const form = $('#waitlist-form');
  const status = $('#waitlist-status');
  $('#waitlist-closed').hidden = true;
  form.hidden = false;
  $('#waitlist-consent-text').textContent = `Quero um e-mail quando a edição de ${niche.label} abrir.`;

  const contact = document.createElement('a');
  contact.href = `mailto:${PRIVACY_CONTACT}`;
  contact.textContent = PRIVACY_CONTACT;
  $('#waitlist-privacy').replaceChildren(
    'Guardamos só o e-mail, a editoria e a data, e usamos só para esse aviso. Para sair da lista ou apagar seus dados, escreva para ',
    contact,
    '.',
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const button = form.querySelector('button');
    button.disabled = true;
    status.dataset.state = 'sending';
    status.textContent = 'Enviando…';
    try {
      const response = await fetch('api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ niche: niche.id, email: data.get('email'), consent: data.get('consent') === 'on', site: data.get('site') }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(ERRORS[body.error] ?? 'Não deu para salvar agora. Tente de novo daqui a pouco.');
      form.reset();
      status.dataset.state = 'done';
      status.textContent = `Pronto. Você recebe um e-mail quando a edição de ${niche.label} abrir.`;
    } catch (error) {
      status.dataset.state = 'error';
      // fetch() itself fails with a TypeError when the connection drops.
      status.textContent = error instanceof TypeError ? 'Sem conexão agora. Tente de novo daqui a pouco.' : error.message;
    } finally {
      button.disabled = false;
    }
  });
}

setupTheme();
const niche = nicheForPath(window.location.pathname);
if (niche?.status !== 'soon') {
  window.location.replace('./');
} else {
  renderTabs($('#niches'), niche.id);
  renderNiche(niche);
  setupWaitlist(niche);
}
