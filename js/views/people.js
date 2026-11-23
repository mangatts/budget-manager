// More → People: everyone who uses the app on this device. Each person has their own cards,
// income, expenses and check-ins. Switching reloads the app with that person's data.
import { el, clear } from '../utils/dom.js';
import { getPeople } from '../appStore.js';
import { showToast } from '../ui/toast.js';
import { storageError, backLink, field, textInput, showErrors, oneAtATime, finish, confirmDeleteForm } from '../ui/form.js';

// Switching starts the app fresh with the other person's data, so nothing of the last person lingers on screen.
export function switchPerson(people, id) {
  const result = people.switchTo(id);
  if (!result.ok) {
    showToast({ message: result.errors.form });
    return;
  }
  location.hash = '#/home';
  location.reload();
}

function personRow(person, isActive) {
  return el('li', { class: 'list-row', 'data-person': person.id },
    el('span', { class: 'list-row-main' },
      el('span', {}, person.name),
      el('a', { href: `#/person/${person.id}`, class: 'list-row-sub', id: `edit-${person.id}` }, 'Edit name or remove'),
    ),
    isActive
      ? el('span', { class: 'pill pill-good', id: 'person-active' }, '✓ Using now')
      : el('button', { class: 'btn btn-secondary', type: 'button', id: `switch-${person.id}`, 'aria-label': `Switch to ${person.name}` }, 'Switch'),
  );
}

export function peopleView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getPeople().then((people) => {
    const list = el('ul', { class: 'list', id: 'people-list' });
    const render = () => {
      const activeId = people.active()?.id;
      clear(list);
      list.append(...people.list().map((p) => personRow(p, p.id === activeId)));
    };
    list.addEventListener('click', (event) => {
      const button = event.target.closest('button[id^="switch-"]');
      if (button) switchPerson(people, button.id.slice('switch-'.length));
    });

    const name = textInput('person-name', null, 'Charles');
    const inputs = [['name', name]];
    const form = el('form', { class: 'section', novalidate: true, id: 'person-form' },
      field('person-name', 'Name', name, 'Their own cards, income and bills start empty.'),
      el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, '＋ Add person'),
    );
    const once = oneAtATime();
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      once(async () => {
        const result = await people.add(name.value);
        if (!finish(result, `Added ${result.record?.name}`, '#/people')) return showErrors(form, inputs, result.errors);
        showErrors(form, inputs);
        name.value = '';
      });
    });

    render();
    const stop = people.subscribe(() => { if (!list.isConnected) return stop(); render(); });
    clear(body);
    body.append(
      el('p', { class: 'lead' }, 'Each person gets their own cards, income, expenses and check-ins. Switch to see and update theirs.'),
      list,
      el('section', { class: 'section', 'aria-labelledby': 'add-person-title' }, el('h2', { class: 'section-title', id: 'add-person-title' }, 'Add a person'), form),
      el('p', { class: 'field-hint', id: 'people-privacy' }, 'Anyone who can open this app on this device can switch to any person. To keep money private, each person should use the app on their own phone.'),
    );
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, backLink('#/more', 'More'), el('h1', { tabindex: '-1' }, 'People'), body);
}

export function personView(id) {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getPeople().then((people) => {
    clear(body);
    const person = people.list().find((p) => p.id === id);
    if (!person) return body.append(el('p', { class: 'lead' }, 'This person is no longer on this device.'), el('a', { class: 'btn btn-secondary', href: '#/people' }, 'Back to People'));

    const name = textInput('person-name', person.name);
    const inputs = [['name', name]];
    const once = oneAtATime();
    const form = el('form', { class: 'section', novalidate: true, id: 'person-form' },
      field('person-name', 'Name', name),
      el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Save changes'),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      once(async () => {
        const result = await people.rename(person.id, name.value);
        if (!finish(result, 'Saved changes', '#/people')) showErrors(form, inputs, result.errors);
      });
    });
    body.append(form);

    const isActive = people.active()?.id === person.id;
    if (people.list().length === 1) return;
    if (isActive) {
      body.append(el('p', { class: 'field-hint', id: 'remove-blocked' }, `You’re using the app as ${person.name} now. To remove ${person.name}, switch to someone else first.`));
      return;
    }
    const removeForm = confirmDeleteForm({
      id: 'remove',
      buttonLabel: `Remove ${person.name}`,
      content: [
        el('h2', { class: 'section-title' }, `Remove ${person.name}`),
        el('p', {}, `This permanently deletes ${person.name}’s cards, check-ins, income and expenses from this device. To keep a copy, switch to ${person.name} and make a backup first.`),
      ],
      async onConfirm() {
        const result = await people.remove(person.id);
        if (result.ok) {
          showToast({ message: `Removed ${person.name}` });
          location.hash = '#/people';
        }
        return result;
      },
    });
    body.append(removeForm);
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, backLink('#/people', 'People'), el('h1', { tabindex: '-1' }, 'Edit person'), body);
}
