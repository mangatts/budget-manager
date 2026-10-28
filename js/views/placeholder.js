import { el } from '../utils/dom.js';

// Temporary screen until each feature is built.
export function placeholderView(title, message) {
  return el('section', {},
    el('h1', { tabindex: '-1' }, title),
    el('p', {}, message),
  );
}
