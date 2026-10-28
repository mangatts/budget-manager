import { el } from '../utils/dom.js';

// A group of big radio "chips" in a <fieldset>. Arrow keys move between options (native radio behavior).
// options: [[value, label], ...]; onChange(value) runs when the selection changes.
export function choiceGroup({ name, legend, options, value, onChange }) {
  const group = el('fieldset', { class: 'choices' },
    el('legend', {}, legend),
    options.map(([optionValue, label]) => el('label', { class: 'choice' },
      el('input', { type: 'radio', name, value: optionValue, id: `${name}-${optionValue}`, checked: optionValue === value }),
      el('span', {}, label),
    )),
  );
  group.addEventListener('change', (event) => onChange(event.target.value));
  return group;
}
