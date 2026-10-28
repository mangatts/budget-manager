import { el } from '../utils/dom.js';

// Temporary screen until each feature is built.
export function placeholderView(title, message) {
  return el('div', { class: 'screen' },
    el('h1', { tabindex: '-1' }, title),
    el('p', { class: 'lead' }, message),
  );
}
