// "Charles · Switch person" under a screen's title, so you always know whose money you're looking at.
// Shows nothing while only one person uses the app.
import { el } from '../utils/dom.js';
import { getPeople } from '../appStore.js';

export function personTag() {
  const slot = el('p', { class: 'field-hint person-tag', id: 'person-tag', hidden: true });
  getPeople().then((people) => {
    if (people.list().length < 2) return;
    slot.append(el('strong', {}, people.active().name), ' · ', el('a', { href: '#/people', id: 'person-switch' }, 'Switch person'));
    slot.hidden = false;
  }, () => {});
  return slot;
}
