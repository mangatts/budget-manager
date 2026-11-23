// Shared form pieces: labelled fields with hint + error, money inputs, and error display.
import { el } from '../utils/dom.js';
import { showToast } from './toast.js';

export const storageError = () => el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device. Try turning off private browsing, or use Chrome or Safari.');
export const backLink = (href, label) => el('a', { class: 'btn btn-quiet back-link', href }, `‹ ${label}`);

// 2499 → "24.99%", 500 → "5%"
export const formatApr = (bps) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
// 125050 → "1250.50" for an input's starting value.
export const centsToInput = (cents) => (cents === null || cents === undefined ? null : (cents / 100).toFixed(2));

export function field(id, label, input, hint) {
  if (hint) input.setAttribute('aria-describedby', `${id}-hint ${id}-error`);
  else input.setAttribute('aria-describedby', `${id}-error`);
  return el('div', { class: 'field' },
    el('label', { class: 'field-label', for: id }, label),
    input.matches('input') && input.classList.contains('input-money') ? el('div', { class: 'money-field' }, el('span', { 'aria-hidden': 'true' }, '$'), input) : input,
    hint ? el('span', { class: 'field-hint', id: `${id}-hint` }, hint) : null,
    el('span', { class: 'field-error', id: `${id}-error`, hidden: true }),
  );
}

export const moneyInput = (id, cents, placeholder = '0.00') => el('input', { class: 'input input-money', id, inputmode: 'decimal', autocomplete: 'off', placeholder, value: centsToInput(cents) });
export const textInput = (id, value, placeholder) => el('input', { class: 'input', id, autocomplete: 'off', placeholder, value });

// inputs: [[errorKey, inputElement], ...]. Shows each error under its field and focuses the first one.
export function showErrors(form, inputs, errors = {}) {
  for (const [key, input] of inputs) {
    const box = form.querySelector(`#${input.id}-error`);
    box.textContent = errors[key] ?? '';
    box.hidden = !errors[key];
    if (errors[key]) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  inputs.find(([key]) => errors[key])?.[1].focus();
  if (errors.form) showToast({ message: errors.form });
}

// Ignores double taps while a save is running.
export function oneAtATime() {
  let busy = false;
  return async (action) => {
    if (busy) return;
    busy = true;
    try { await action(); } finally { busy = false; }
  };
}

// After a save or delete: "Saved · Undo", then go to `href`.
export function finish(result, message, href) {
  if (!result.ok) return false;
  showToast({ message, action: { label: 'Undo', run: async () => { await result.undo(); return 'Undone'; } } });
  location.hash = href;
  return true;
}

// A form for something that can't be undone: the button only works once "DELETE" is typed.
// onConfirm() returns { ok } or { ok: false, errors: { form } }; a failure is shown and the button comes back.
export const CONFIRM_WORD = 'DELETE';
export function confirmDeleteForm({ id, buttonLabel, content, onConfirm }) {
  const input = el('input', { class: 'input', id: `${id}-confirm`, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-describedby': `${id}-hint` });
  const button = el('button', { class: 'btn btn-danger btn-block', type: 'submit', id: `${id}-button`, disabled: true }, buttonLabel);
  const error = el('p', { class: 'field-error', role: 'alert', hidden: true });
  const form = el('form', { class: 'section', novalidate: true, id: `${id}-form` },
    ...content,
    el('div', { class: 'field' },
      el('label', { class: 'field-label', for: `${id}-confirm` }, `Type ${CONFIRM_WORD} to confirm`),
      input,
      el('span', { class: 'field-hint', id: `${id}-hint` }, 'In capital letters'),
    ),
    error,
    button,
  );
  const typed = () => input.value.trim() === CONFIRM_WORD;
  input.addEventListener('input', () => { button.disabled = !typed(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!typed() || button.dataset.busy) return;
    button.disabled = true;
    button.dataset.busy = '1';
    const result = await onConfirm();
    delete button.dataset.busy;
    if (result.ok) return;
    error.textContent = result.errors.form;
    error.hidden = false;
    button.disabled = false;
  });
  return form;
}
