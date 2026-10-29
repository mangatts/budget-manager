import { el } from '../utils/dom.js';

// Temporary Home until the dashboard (Sprint 3): points straight to Add so it's never a dead end.
export function homeView() {
  return el('div', { class: 'screen' },
    el('h1', { tabindex: '-1' }, 'Home'),
    el('p', { class: 'lead' }, 'Your month at a glance is coming in Sprint 3. For now, start by adding what you spend and earn.'),
    el('a', { class: 'btn btn-primary btn-block', href: '#/add' }, '＋ Add money in or out'),
  );
}
