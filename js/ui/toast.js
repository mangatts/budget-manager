// One short message at a time, above the tab bar, read out by screen readers.
// Used for "Added … · Undo" so mistakes are one tap to fix (no "Are you sure?" dialogs).
import { el, clear } from '../utils/dom.js';

let region;
let timer;

function getRegion() {
  if (!region || !region.isConnected) {
    region = el('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  return region;
}

export function hideToast() {
  clearTimeout(timer);
  if (region) clear(region);
}

// showToast({ message, action: { label, run } }) — run() may be async.
export function showToast({ message, action, duration = 6000 }) {
  const target = getRegion();
  hideToast();
  const button = action && el('button', { class: 'btn btn-quiet toast-action', type: 'button' }, action.label);
  target.append(el('div', { class: 'toast' }, el('span', { class: 'toast-message' }, message), button));
  if (button) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const done = await action.run();
        showToast({ message: done ?? 'Done', duration: 2500 });
      } catch {
        showToast({ message: 'That didn’t work. Please try again.', duration: 4000 });
      }
    });
  }
  timer = setTimeout(hideToast, duration);
}
