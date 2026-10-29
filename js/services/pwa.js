// Installable app + offline support + asking the browser to keep our data.

const SW_URL = './sw.js';

let installPrompt = null;
let updateRequested = false;

// Local development skips the service worker so edits show up on refresh.
// Tests opt in with localStorage 'bm:dev-sw' = '1'.
function serviceWorkerWanted() {
  if (!('serviceWorker' in navigator)) return false;
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) return true;
  try { return localStorage.getItem('bm:dev-sw') === '1'; } catch { return false; }
}

// onUpdateReady(apply) is called when a new version is installed and waiting; apply() switches to it.
export function registerServiceWorker({ onUpdateReady }) {
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // show our own Install button instead of the browser's mini-bar
    installPrompt = event;
  });
  addEventListener('appinstalled', () => { installPrompt = null; requestPersistence(); });

  if (!serviceWorkerWanted()) return;

  const offer = (worker) => onUpdateReady(() => {
    updateRequested = true;
    worker.postMessage('skip-waiting');
  });

  // Our CSP requires Trusted Types for script URLs. This policy allows exactly one: our own worker.
  const policy = globalThis.trustedTypes?.createPolicy('bm-sw', {
    createScriptURL: (url) => {
      if (url !== SW_URL) throw new TypeError(`Blocked script URL: ${url}`);
      return url;
    },
  });

  // "installed" with an existing controller = an update waiting (not the very first install).
  // Checks a worker's current state as well as future changes, so an update that started
  // while the app was still loading isn't missed.
  const track = (worker) => {
    if (!worker) return;
    const check = () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker); };
    check();
    worker.addEventListener('statechange', check);
  };

  navigator.serviceWorker.register(policy ? policy.createScriptURL(SW_URL) : SW_URL).then((registration) => {
    track(registration.waiting);
    track(registration.installing);
    registration.addEventListener('updatefound', () => track(registration.installing));
  }).catch(() => { /* offline support unavailable; the app still works online */ });

  // Reload once the new version takes over, but only when the person asked for it.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
  });
}

// 'installed' | 'prompt' (we can show an Install button) | 'ios' (Share → Add to Home Screen) | 'manual'
export function installState() {
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) return 'installed';
  if (installPrompt) return 'prompt';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios ? 'ios' : 'manual';
}

export async function promptInstall() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === 'accepted';
}

// Asks the browser not to clean up our storage when space is low. Safe to call repeatedly.
export async function requestPersistence() {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageStatus() {
  try {
    const [persisted, estimate] = await Promise.all([navigator.storage?.persisted?.() ?? false, navigator.storage?.estimate?.() ?? {}]);
    return { persisted: Boolean(persisted), usage: estimate.usage ?? null };
  } catch {
    return { persisted: false, usage: null };
  }
}
