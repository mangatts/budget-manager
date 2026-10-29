// One short message at a time, above the tab bar, read out by screen readers.
// Used for "Added … · Undo" so mistakes are one tap to fix (no "Are you sure?" dialogs).
// A "sticky" message (like "New version ready · Update") comes back after any short message ends.
import { el, clear } from '../utils/dom.js';

let region;
let timer = null;
let sticky = null;

// Screen readers only announce changes to a live region that already exists,
// so the app creates it (empty) at startup, before the first message.
export function initToasts() {
  if (!region || !region.isConnected) {
    region = el('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  return region;
}

function render({ message, action }) {
  const target = initToasts();
  clear(target);
  const button = action && el('button', { class: 'btn btn-quiet toast-action', type: 'button' }, action.label);
  target.append(el('div', { class: 'toast' }, el('span', { class: 'toast-message' }, message), button));
  button?.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const done = await action.run();
      showToast({ message: done ?? 'Done', duration: 2500 });
    } catch {
      showToast({ message: 'That didn’t work. Please try again.', action }); // keep the button so they can retry
    }
  });
}

export function hideToast() {
  clearTimeout(timer);
  timer = null;
  if (!region) return;
  clear(region);
  if (sticky) render(sticky);
}

// showToast({ message, action: { label, run }, duration }) — run() may be async. duration: null keeps it until replaced.
export function showToast({ message, action, duration = 6000 }) {
  clearTimeout(timer);
  timer = null;
  render({ message, action });
  if (duration) timer = setTimeout(hideToast, duration);
}

// Shows `options` now (unless a short message is up) and again whenever a short message ends.
export function setStickyToast(options) {
  sticky = options;
  if (!timer) hideToast();
}
